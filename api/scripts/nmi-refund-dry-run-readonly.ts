import { writeFile } from "node:fs/promises";
import {
  auditNmiScope,
  buildNmiRefundDryRun,
  type NmiRefundDryRunSourceRow,
  type NmiScopeAuditInput,
} from "../src/nmi-refund-dry-run.ts";

const NAMED_NMI_PLATFORMS = Object.freeze([
  "nmi:blackboxproducts0362",
  "nmi:echolabsaudio24",
  "nmi:ezytechco",
  "nmi:lifeheater14090",
  "nmi:lifeheater6897",
  "nmi:paul4969",
  "nmi:thermostorm",
  "nmi:timothy4951",
  "nmi:tpaul4993",
  "nmi:tpaul9204",
]);

type Row = Record<string, any>;
const baseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
if (!baseUrl || !serviceKey) throw new Error("Read-only Supabase configuration is unavailable.");
const headers = Object.freeze({ apikey: serviceKey, Authorization: `Bearer ${serviceKey}` });

async function get(path: string): Promise<Row[]> {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, { method: "GET", headers });
  if (!response.ok) throw new Error(`Read-only audit query failed (${response.status}).`);
  const value: unknown = await response.json();
  return Array.isArray(value) ? value as Row[] : [value as Row];
}

async function paged(path: string) {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    const delimiter = path.includes("?") ? "&" : "?";
    const page = await get(`${path}${delimiter}limit=1000&offset=${offset}`);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

function exactConnectionMatch(platform: string, row: Row) {
  return row.external_account_id === platform || row.metadata?.platform === platform || row.metadata?.credential_platform === platform;
}

function exactProviderAccountMatch(platform: string, row: Row) {
  return row.provider_account_external_id === platform || row.metadata?.platform === platform || row.metadata?.credential_platform === platform;
}

async function main() {
  const allOrders: Row[] = [];
  for (const platform of NAMED_NMI_PLATFORMS) {
    allOrders.push(...await paged(`platform_orders?platform=eq.${encodeURIComponent(platform)}&select=platform,platform_order_id,transaction_id,order_id,canonical_order_id,account_id,organization_id,connection_id,provider_account_id,raw_json`));
  }
  const [connections, providerAccounts] = await Promise.all([
    paged("commerce_provider_connections?select=id,account_id,organization_id,external_account_id,metadata"),
    paged("commerce_provider_accounts?select=id,connection_id,organization_id,provider_account_external_id,metadata"),
  ]);

  const scopes = Object.fromEntries(NAMED_NMI_PLATFORMS.map((platform) => {
    const input: NmiScopeAuditInput = {
      platform,
      platformOrderScopes: allOrders.filter((row) => row.platform === platform).map((row) => ({ accountId: row.account_id, organizationId: row.organization_id, connectionId: row.connection_id, providerAccountId: row.provider_account_id })),
      exactConnections: connections.filter((row) => exactConnectionMatch(platform, row)).map((row) => ({ id: row.id, accountId: row.account_id, organizationId: row.organization_id })),
      exactProviderAccounts: providerAccounts.filter((row) => exactProviderAccountMatch(platform, row)).map((row) => ({ id: row.id, connectionId: row.connection_id, organizationId: row.organization_id })),
    };
    return [platform, auditNmiScope(input)];
  }));

  const sourceRows: NmiRefundDryRunSourceRow[] = allOrders.flatMap((row) => {
    const transactionXml = typeof row.raw_json?.xml === "string" ? row.raw_json.xml : null;
    if (!transactionXml) return [];
    return [{ platform: row.platform, platformOrderId: row.platform_order_id, transactionId: row.transaction_id, orderId: row.order_id, canonicalOrderId: row.canonical_order_id, transactionXml }];
  });
  const report = await buildNmiRefundDryRun({
    rows: sourceRows,
    parentRows: allOrders.map((row) => ({ platform: row.platform, transactionId: row.transaction_id, canonicalOrderId: row.canonical_order_id })),
    scopes,
  });
  const outputPath = process.argv.find((arg) => arg.startsWith("--output="))?.slice("--output=".length);
  if (outputPath) await writeFile(outputPath, `${JSON.stringify(report.manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({
    mode: "read_only",
    provider_requests: 0,
    production_writes: 0,
    manifest_hash: report.manifestHash,
    counts: report.counts,
    successful_economic_totals: report.successfulEconomicTotals,
    failed_attempted_totals: report.failedAttemptedTotals,
    scope_audit: scopes,
    financial_fingerprint_conflicts: report.financialFingerprintConflicts,
  }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "NMI refund dry-run failed.");
  process.exitCode = 1;
});
