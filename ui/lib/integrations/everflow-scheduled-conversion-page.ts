import "server-only";
import { randomUUID } from "node:crypto";
import type { CommerceControlPlane } from "@/lib/commerce/control-plane";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import { EverflowHealthError } from "./everflow-client";
import { listEverflowConversionsPage, persistEverflowConversions } from "./everflow-conversions";
import { resolveAndMapEverflowOrder } from "./everflow-order-linkage";

type ConversionSyncPlane = Pick<CommerceControlPlane,
  | "getConnection"
  | "listProviderAccounts"
  | "resolveCredentialForExecution"
  | "createSyncRun"
  | "claimSyncRun"
  | "heartbeatSyncRun"
  | "completeSyncRun"
  | "failSyncRun"
  | "beginCheckpoint"
  | "completeCheckpoint"
  | "failCheckpoint"
  | "resolveSourceMapping"
  | "createOrObserveSourceMapping"
>;

type Row = Record<string, unknown>;
const record = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const cleanString = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
};

async function fingerprint(value: unknown) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function syncEverflowScheduledConversionPage(input: {
  plane: ConversionSyncPlane;
  session: TraceKitSessionContext;
  organizationId: string;
  connectionId: string;
  from: string;
  to: string;
  page: number;
  pageSize?: number;
}) {
  const connection = await input.plane.getConnection(input.session, input.connectionId);
  if (connection.organizationId !== input.organizationId || connection.provider !== "everflow" || connection.status !== "connected") {
    throw new Error("Everflow connection is unavailable.");
  }
  const accounts = await input.plane.listProviderAccounts(input.session, input.connectionId);
  const account = accounts.find((candidate) => candidate.status === "active" && !candidate.provisional);
  if (!account) throw new Error("Everflow provider account is unavailable.");
  const network = record(connection.capabilities?.everflowNetwork);
  const timezoneId = Number(network.timezoneId);
  const currencyId = cleanString(network.currencyId)?.toUpperCase();
  if (!Number.isInteger(timezoneId) || !currencyId) throw new Error("Everflow reporting metadata is unavailable. Re-verify the connection.");
  const apiKey = await input.plane.resolveCredentialForExecution(input.session, input.connectionId);
  const page = Math.max(1, Math.trunc(Number(input.page || 1)));
  const pageSize = Math.min(1000, Math.max(1, Math.trunc(Number(input.pageSize || 200))));

  const run = await input.plane.createSyncRun(input.session, input.connectionId, account.id, "shadow", "everflow_conversions");
  const owner = `everflow-conversions:${randomUUID()}`;
  const claimed = await input.plane.claimSyncRun(input.session, input.connectionId, run.id, owner, 120);
  if (!claimed) throw new Error("Everflow conversion sync could not acquire its run lease.");

  const linkage = { matched: 0, unmatched: 0, non_order: 0, duplicate: 0, ambiguous: 0, conflict: 0 };
  const checkpoint = await input.plane.beginCheckpoint(input.session, input.connectionId, {
    syncRunId: run.id,
    providerAccountId: account.id,
    resource: "everflow_conversions",
    page,
    perPage: pageSize,
    pageFingerprint: null,
  });

  try {
    const result = await listEverflowConversionsPage({
      apiKey,
      from: input.from,
      to: input.to,
      timezoneId,
      currencyId,
      page,
      pageSize,
    });
    for (const conversion of result.conversions) {
      if (conversion.networkId && String(conversion.networkId) !== String(account.externalId)) {
        throw new EverflowHealthError("everflow_network_mismatch", "Everflow conversion data does not belong to the connected network.", 409, false);
      }
    }

    const persisted = await persistEverflowConversions({
      accountId: connection.accountId,
      organizationId: input.organizationId,
      connectionId: input.connectionId,
      providerAccountId: account.id,
      syncRunId: run.id,
      conversions: result.conversions,
    });

    for (const conversion of result.conversions) {
      const decision = await resolveAndMapEverflowOrder({
        plane: input.plane,
        session: input.session,
        link: {
          organizationId: input.organizationId,
          connectionId: input.connectionId,
          sourceRecordId: conversion.conversionId,
          transactionId: conversion.transactionId,
          email: conversion.emailNormalized,
          occurredAt: conversion.conversionAt,
          amount: conversion.saleAmount ?? conversion.revenue,
          isCommerceValue: (conversion.saleAmount ?? 0) !== 0 || (conversion.revenue ?? 0) !== 0,
        },
      });
      linkage[decision.status] += 1;
    }

    const pageFingerprint = await fingerprint(result.conversions.map((conversion) => [conversion.sourceIdentity, conversion.payloadHash]));
    await input.plane.completeCheckpoint(input.session, input.connectionId, checkpoint.id, pageFingerprint);
    await input.plane.heartbeatSyncRun(input.session, input.connectionId, run.id, owner, 120);
    const sourceComplete = !result.conversions.length || result.conversions.length < result.pageSize || page * result.pageSize >= result.totalCount;
    const withWarnings = linkage.ambiguous > 0 || linkage.conflict > 0;
    await input.plane.completeSyncRun(input.session, input.connectionId, run.id, owner, withWarnings);

    return {
      connectionId: input.connectionId,
      providerAccountId: account.id,
      networkId: account.externalId,
      syncRunId: run.id,
      from: input.from,
      to: input.to,
      seen: result.conversions.length,
      persisted,
      pages: 1,
      page,
      pageSize: result.pageSize,
      totalCount: result.totalCount,
      sourceComplete,
      nextPage: sourceComplete ? 1 : page + 1,
      linkage,
    };
  } catch (error) {
    await input.plane.failCheckpoint(input.session, input.connectionId, checkpoint.id, checkpoint.retryCount + 1).catch(() => undefined);
    const summary = error instanceof Error ? error.message : "Everflow conversion sync failed.";
    await input.plane.failSyncRun(input.session, input.connectionId, run.id, owner, "everflow_conversion_sync_failed", summary).catch(() => undefined);
    throw error;
  }
}
