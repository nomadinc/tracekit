import "server-only";
import { commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";

type Row = Record<string, unknown>;

const cleanId = (value: unknown) => {
  const text = String(value ?? "").trim();
  return /^[1-9][0-9]*$/.test(text) ? text : null;
};

const rate = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error("Pass rate must be a JSON number between 0 and 1.");
  return value;
};

const q = (value: string) => encodeURIComponent(value);
const asRate = (value: unknown) => value === null || value === undefined ? null : Number(value);

export async function readEverflowScrubberConfiguration(input: {
  organizationId: string;
  connectionId: string;
  offerId?: string | null;
  affiliateId?: string | null;
}) {
  const scope = `organization_id=eq.${q(input.organizationId)}&connection_id=eq.${q(input.connectionId)}`;
  const [settingsRows, offerRows, pairRows] = await Promise.all([
    commercePersistenceRequest(`everflow_scrubber_settings?${scope}&select=scrubbing_enabled,global_pass_rate,fail_open,reporting_timezone,daily_period_rollover,eligible_event_keys,updated_at&limit=1`),
    commercePersistenceRequest(`everflow_scrubber_offer_rules?${scope}&ended_at=is.null&select=id,network_offer_id,pass_rate,effective_at,created_by,change_reason&order=network_offer_id.asc`),
    commercePersistenceRequest(`everflow_scrubber_pair_rules?${scope}&ended_at=is.null&select=id,network_offer_id,network_affiliate_id,pass_rate,effective_at,created_by,change_reason&order=network_offer_id.asc,network_affiliate_id.asc`),
  ]);
  const settings = settingsRows[0];
  if (!settings) throw new Error("Scrubber settings are unavailable.");
  const offers = offerRows.map((row: Row) => ({ id: String(row.id), offerId: String(row.network_offer_id), passRate: Number(row.pass_rate), scrubRate: 1 - Number(row.pass_rate), effectiveAt: String(row.effective_at), changeReason: row.change_reason ? String(row.change_reason) : null }));
  const pairs = pairRows.map((row: Row) => ({ id: String(row.id), offerId: String(row.network_offer_id), affiliateId: String(row.network_affiliate_id), passRate: Number(row.pass_rate), scrubRate: 1 - Number(row.pass_rate), effectiveAt: String(row.effective_at), changeReason: row.change_reason ? String(row.change_reason) : null }));
  const offerId = input.offerId ? cleanId(input.offerId) : null;
  const affiliateId = input.affiliateId ? cleanId(input.affiliateId) : null;
  const pair = offerId && affiliateId ? pairs.find((row) => row.offerId === offerId && row.affiliateId === affiliateId) : null;
  const offer = offerId ? offers.find((row) => row.offerId === offerId) : null;
  const effective = pair ? { source: "pair", ruleId: pair.id, passRate: pair.passRate, scrubRate: pair.scrubRate, effectiveAt: pair.effectiveAt }
    : offer ? { source: "offer", ruleId: offer.id, passRate: offer.passRate, scrubRate: offer.scrubRate, effectiveAt: offer.effectiveAt }
    : { source: "global", ruleId: null, passRate: Number(settings.global_pass_rate), scrubRate: 1 - Number(settings.global_pass_rate), effectiveAt: String(settings.updated_at) };
  return {
    settings: {
      scrubbingEnabled: Boolean(settings.scrubbing_enabled), globalPassRate: Number(settings.global_pass_rate),
      globalScrubRate: 1 - Number(settings.global_pass_rate), failOpen: Boolean(settings.fail_open),
      reportingTimezone: String(settings.reporting_timezone), dailyPeriodRollover: Boolean(settings.daily_period_rollover),
      eligibleEventKeys: Array.isArray(settings.eligible_event_keys) ? settings.eligible_event_keys.map(String) : [], updatedAt: String(settings.updated_at),
    },
    offerDefaults: offers,
    pairOverrides: pairs,
    effectiveRule: offerId && affiliateId ? effective : null,
  };
}

export async function updateEverflowScrubberConfiguration(input: {
  organizationId: string;
  connectionId: string;
  actorUserId: string;
  body: Record<string, unknown>;
}) {
  const kind = String(input.body.kind || "");
  if (kind === "global") {
    const passRate = input.body.passRate === undefined ? null : rate(input.body.passRate);
    const enabled = input.body.scrubbingEnabled === undefined ? null : input.body.scrubbingEnabled;
    if (enabled !== null && typeof enabled !== "boolean") throw new Error("scrubbingEnabled must be boolean.");
    if (passRate === null && enabled === null) throw new Error("A global setting change is required.");
    await commercePersistenceRequest("rpc/update_everflow_scrubber_global_v1", { method: "POST", body: JSON.stringify({ p_organization_id: input.organizationId, p_connection_id: input.connectionId, p_global_pass_rate: passRate, p_scrubbing_enabled: enabled, p_updated_by: input.actorUserId }) });
  } else if (kind === "offer") {
    const offerId = cleanId(input.body.offerId);
    if (!offerId) throw new Error("A valid offerId is required.");
    await commercePersistenceRequest("rpc/set_everflow_scrubber_offer_rule_v1", { method: "POST", body: JSON.stringify({ p_organization_id: input.organizationId, p_connection_id: input.connectionId, p_network_offer_id: offerId, p_pass_rate: rate(input.body.passRate), p_created_by: input.actorUserId, p_change_reason: String(input.body.changeReason || "").slice(0, 500) || null }) });
  } else if (kind === "pair") {
    const offerId = cleanId(input.body.offerId);
    const affiliateId = cleanId(input.body.affiliateId);
    if (!offerId || !affiliateId) throw new Error("Valid offerId and affiliateId values are required.");
    await commercePersistenceRequest("rpc/set_everflow_scrubber_pair_rule_v1", { method: "POST", body: JSON.stringify({ p_organization_id: input.organizationId, p_connection_id: input.connectionId, p_network_offer_id: offerId, p_network_affiliate_id: affiliateId, p_pass_rate: rate(input.body.passRate), p_created_by: input.actorUserId, p_change_reason: String(input.body.changeReason || "").slice(0, 500) || null }) });
  } else {
    throw new Error("Unsupported configuration change.");
  }
  return readEverflowScrubberConfiguration({ organizationId: input.organizationId, connectionId: input.connectionId, offerId: cleanId(input.body.offerId), affiliateId: cleanId(input.body.affiliateId) });
}

export function normalizedPassRate(value: unknown) { return asRate(value); }
