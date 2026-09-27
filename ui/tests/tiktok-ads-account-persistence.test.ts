import { normalizeTikTokAdvertiserAccount } from "../lib/integrations/tiktok-ads-account-discovery";
import { persistTikTokDiscoveredAccounts } from "../lib/integrations/tiktok-ads-persistence";

const account = normalizeTikTokAdvertiserAccount({ advertiser_id: "700000000000000001", advertiser_name: "Fixture Advertiser", currency: "usd", timezone: "America/Los_Angeles", status: "STATUS_ENABLE" });
if (account.advertiserId !== "700000000000000001" || account.currency !== "USD" || account.timezoneName !== "America/Los_Angeles") throw new Error("TikTok advertiser normalization failed.");

type Row = Record<string, any>;
const rows: Row[] = [];
async function transport(path: string, init: RequestInit = {}): Promise<Row[]> {
  const method = init.method || "GET";
  if (path.startsWith("marketing_provider_accounts?") && method === "GET") return rows;
  if (path === "marketing_provider_accounts" && method === "POST") {
    const body = JSON.parse(String(init.body));
    const row = { id: "provider-account-1", ...body };
    rows.push(row);
    return [row];
  }
  if (path.startsWith("marketing_provider_accounts?id=eq.") && method === "PATCH") {
    const body = JSON.parse(String(init.body));
    Object.assign(rows[0], body);
    return [rows[0]];
  }
  throw new Error("Unexpected transport path " + path);
}

const first = await persistTikTokDiscoveredAccounts({ accountId: "acct", organizationId: "org", connectionId: "conn", accounts: [account], transport });
if (first.length !== 1 || first[0].selected_for_sync !== false || first[0].eligible_for_spend_sync !== true) throw new Error("New TikTok advertiser must be unselected but spend eligible.");

rows[0].selected_for_sync = true;
const rediscovered = await persistTikTokDiscoveredAccounts({ accountId: "acct", organizationId: "org", connectionId: "conn", accounts: [{ ...account, name: "Renamed Advertiser" }], transport });
if (rediscovered[0].selected_for_sync !== true) throw new Error("TikTok rediscovery must preserve explicit selection.");
if (rediscovered[0].provider_account_label !== "Renamed Advertiser") throw new Error("TikTok rediscovery must refresh provider metadata.");

console.log("tiktok-ads-account-persistence tests passed");
