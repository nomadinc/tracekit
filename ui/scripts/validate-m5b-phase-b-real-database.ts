import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  listGovernedActionNotifications,
  queryGovernedActionNotifications,
  updateGovernedActionNotificationState,
} from "../lib/mcp/action-notifications";
import { WS019_M44_PHASE_B } from "../lib/mcp/m44-phase-b-acceptance";

const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key || !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(base)) {
  throw new Error("disposable local Supabase is required");
}
const actor = "40000000-0000-4000-8000-000000000002";
const org = WS019_M44_PHASE_B.organizationId;
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`${base}/rest/v1/${path}`, {
    method,
    headers: { ...headers, ...(method === "GET" ? {} : { Prefer: "return=representation" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

const specifications = {
  intents: `mcp_action_intents?organization_id=eq.${org}&select=*&order=intent_id.asc`,
  confirmations: `mcp_action_confirmations?organization_id=eq.${org}&select=*&order=confirmation_id.asc`,
  authorizations: `mcp_action_authorizations?organization_id=eq.${org}&select=*&order=authorization_id.asc`,
  results: `mcp_action_execution_results?organization_id=eq.${org}&select=*&order=id.asc`,
  recovery: `mcp_shopify_mutation_recovery?organization_id=eq.${org}&select=*&order=recovery_id.asc`,
  presentation: `mcp_action_notification_states?organization_id=eq.${org}&select=*&order=notification_id.asc`,
  workItems: `work_items?workspace_id=eq.${org}&select=*&order=id.asc`,
  workItemActivity: `work_item_activity?workspace_id=eq.${org}&select=*&order=id.asc`,
  externalActionAudit: `mcp_external_action_audit?organization_id=eq.${org}&select=*&order=execution_id.asc`,
  externalMutationAudit: `mcp_external_mutation_audit?organization_id=eq.${org}&select=*&order=execution_id.asc`,
} as const;

async function snapshot() {
  return Object.fromEntries(await Promise.all(Object.entries(specifications).map(async ([name, path]) => {
    const rows = await api(path) as unknown[];
    return [name, { count: rows.length, hash: createHash("sha256").update(JSON.stringify(rows)).digest("hex"), rows }];
  }))) as Record<keyof typeof specifications, { count: number; hash: string; rows: any[] }>;
}

async function rpc(name: string) {
  return api(`rpc/${name}`, "POST", { p_organization_id: org, p_actor_user_id: actor });
}

async function rejectedRpc(name: string, organizationId: string) {
  await assert.rejects(
    api(`rpc/${name}`, "POST", { p_organization_id: organizationId, p_actor_user_id: actor }),
    /acceptance fixture unavailable/,
  );
}

async function main() {
  const before = await snapshot();
  await rejectedRpc("create_ws019_m44_phase_b_fixture", "11111111-1111-4111-8111-111111111111");
  assert.deepEqual(await snapshot(), before, "non-Stem rejection changed state");
  const created = await rpc("create_ws019_m44_phase_b_fixture");
  assert.equal(created.created, true);
  const createdSnapshot = await snapshot();
  const replay = await rpc("create_ws019_m44_phase_b_fixture");
  assert.equal(replay.created, false);
  assert.deepEqual(await snapshot(), createdSnapshot, "idempotent create rewrote fixture state");

  const initial = await listGovernedActionNotifications(org);
  assert.equal(initial.length, 3);
  assert.deepEqual(initial.map((item) => item.id).sort(), Object.values(WS019_M44_PHASE_B.notificationIds).sort());
  const awaiting = initial.find((item) => item.id === WS019_M44_PHASE_B.notificationIds.awaiting)!;
  const failure = initial.find((item) => item.id === WS019_M44_PHASE_B.notificationIds.executionFailure)!;
  const recovery = initial.find((item) => item.id === WS019_M44_PHASE_B.notificationIds.incompleteRecovery)!;
  assert.equal(awaiting.metadata.priority, "high");
  assert.equal(failure.metadata.priority, "urgent");
  assert.equal(recovery.metadata.priority, "urgent");
  assert.equal(awaiting.deep_link, `/activity?intent_id=${WS019_M44_PHASE_B.intents.awaiting}`);
  assert.equal(failure.deep_link, `/activity?intent_id=${WS019_M44_PHASE_B.intents.executionFailure}`);
  assert.equal(recovery.deep_link, `/activity?intent_id=${WS019_M44_PHASE_B.intents.incompleteRecovery}`);
  assert.deepEqual(await listGovernedActionNotifications(org), initial, "evaluation was not deterministic");
  assert.equal((await snapshot()).presentation.count, 0, "evaluation created presentation state");

  const lifecycleBeforePresentation = await snapshot();
  await updateGovernedActionNotificationState(org, awaiting.id, "read");
  let presentation = (await snapshot()).presentation.rows;
  assert.equal(presentation.length, 1);
  assert.equal(presentation[0].notification_id, awaiting.id);
  assert.ok(presentation[0].read_at);
  assert.equal(presentation[0].dismissed_at, null);

  await updateGovernedActionNotificationState(org, failure.id, "dismiss");
  presentation = (await snapshot()).presentation.rows;
  assert.equal(presentation.length, 2);
  const dismissed = presentation.find((row) => row.notification_id === failure.id)!;
  assert.ok(dismissed.read_at);
  assert.ok(dismissed.dismissed_at);
  const afterPresentation = await snapshot();
  for (const surface of ["intents", "confirmations", "authorizations", "results", "recovery"] as const) {
    assert.equal(afterPresentation[surface].hash, lifecycleBeforePresentation[surface].hash, `${surface} changed during presentation actions`);
  }

  const immutableFailureHash = afterPresentation.results.hash;
  await rpc("resolve_ws019_m44_phase_b_awaiting");
  await rpc("resolve_ws019_m44_phase_b_awaiting");
  let active = await listGovernedActionNotifications(org);
  assert.ok(!active.some((item) => item.id === awaiting.id));
  assert.ok(active.some((item) => item.id === recovery.id));

  await rpc("resolve_ws019_m44_phase_b_recovery");
  await rpc("resolve_ws019_m44_phase_b_recovery");
  active = await listGovernedActionNotifications(org);
  assert.deepEqual(active.map((item) => item.id), [failure.id]);
  assert.equal(active[0].status, "dismissed");
  const finalQuery = await queryGovernedActionNotifications(org);
  assert.deepEqual(finalQuery.counts, { total: 1, unread: 0, read: 0, resolved: 0, dismissed: 1, critical: 1, warning: 0, info: 0, healthy: 0 });

  const resolvedSnapshot = await snapshot();
  const resolvedReplay = await rpc("create_ws019_m44_phase_b_fixture");
  assert.equal(resolvedReplay.created, false);
  assert.deepEqual(await snapshot(), resolvedSnapshot, "create reset resolved fixture state");

  const final = await snapshot();
  assert.equal(final.intents.count - before.intents.count, 3);
  assert.equal(final.confirmations.count - before.confirmations.count, 3);
  assert.equal(final.authorizations.count - before.authorizations.count, 1);
  assert.equal(final.results.count - before.results.count, 1);
  assert.equal(final.recovery.count - before.recovery.count, 1);
  assert.equal(final.presentation.count - before.presentation.count, 2);
  assert.equal(final.results.hash, immutableFailureHash, "immutable failure evidence changed during resolution");
  const retainedRecovery = final.recovery.rows.find((row) => row.recovery_id === WS019_M44_PHASE_B.recovery)!;
  assert.equal(retainedRecovery.state, "rollback_verified");
  assert.equal(retainedRecovery.rollback_verified, true);
  for (const surface of ["workItems", "workItemActivity", "externalActionAudit", "externalMutationAudit"] as const) {
    assert.equal(final[surface].hash, before[surface].hash, `${surface} changed`);
  }
  assert.ok(!JSON.stringify(final).match(/access_token|refresh_token|api_key|credential_ciphertext/i));

  console.log(JSON.stringify({
    status: "PASS",
    before: Object.fromEntries(Object.entries(before).map(([name, value]) => [name, { count: value.count, hash: value.hash }])),
    final: Object.fromEntries(Object.entries(final).map(([name, value]) => [name, { count: value.count, hash: value.hash }])),
    initialNotificationIds: initial.map((item) => item.id),
    finalCounts: finalQuery.counts,
  }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
