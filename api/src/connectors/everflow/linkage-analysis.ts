import { createHash } from "node:crypto";

export type EverflowFieldCategory =
  | "identity" | "transaction" | "conversion/event" | "affiliate" | "campaign"
  | "sub-ID" | "click" | "checkout" | "customer/contact" | "amount"
  | "timestamp" | "URL" | "device" | "network" | "geography" | "metadata" | "unknown";

export type FieldProfile = {
  field: string;
  category: EverflowFieldCategory;
  rows: number;
  nonNull: number;
  nullRate: number;
  observedTypes: string[];
  distinctCount: number;
  cardinality: "none" | "constant" | "low" | "medium" | "high" | "near_unique";
  transactionGroupsObserved: number;
  stableGroups: number;
  varyingGroups: number;
};

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const present = (value: unknown) => String(value ?? "").trim();
const compactDigest = (value: string) => {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
};

export function classifyEverflowField(field: string): EverflowFieldCategory {
  const name = field.toLowerCase();
  if (name === "email") return "customer/contact";
  if (/(^|_)(date|timestamp|time|at)$/.test(name) || name === "delta_hours") return "timestamp";
  if (/(revenue|payout|sale_amount|amount|fee|price)/.test(name)) return "amount";
  if (/(referer|url|origin|landing)/.test(name)) return "URL";
  if (/^(sub|adv)\d+$/.test(name)) return name.startsWith("sub") ? "sub-ID" : "metadata";
  if (/(affiliate|manager)/.test(name)) return "affiliate";
  if (/campaign|creative/.test(name)) return "campaign";
  if (/(click|cookie|view_through|fired_pixel|attribution)/.test(name)) return "click";
  if (/(order|checkout|coupon|line_item)/.test(name)) return "checkout";
  if (/(device|browser|platform|user_agent|android|google_ad|idfa|language|os_version)/.test(name)) return "device";
  if (/(ip|isp|carrier)/.test(name)) return "network";
  if (/(country|region|city|dma)/.test(name)) return "geography";
  if (/(transaction|payment|session)/.test(name)) return "transaction";
  if (/(conversion|event|status|scrub|type)/.test(name)) return "conversion/event";
  if (/(^|_)id$/.test(name) || name.endsWith("_id")) return "identity";
  if (/(notes|error|brand|category|project|previous)/.test(name)) return "metadata";
  return "unknown";
}

export function observedScalarType(value: string): string {
  const candidate = value.trim();
  if (!candidate) return "null";
  if (/^(true|false)$/i.test(candidate)) return "boolean";
  if (/^-?\d+(\.\d+)?$/.test(candidate)) return "number";
  if (!Number.isNaN(Date.parse(candidate)) && /[-/:T]/.test(candidate)) return "timestamp";
  if (/^[\[{]/.test(candidate)) {
    try { const parsed = JSON.parse(candidate); return Array.isArray(parsed) ? "json_array" : "json_object"; } catch { /* string */ }
  }
  try { const url = new URL(candidate); if (url.protocol === "http:" || url.protocol === "https:") return "url"; } catch { /* string */ }
  return "string";
}

export function cardinalityClass(distinct: number, nonNull: number): FieldProfile["cardinality"] {
  if (!nonNull) return "none";
  if (distinct === 1) return "constant";
  const ratio = distinct / nonNull;
  if (ratio >= .95) return "near_unique";
  if (ratio >= .2) return "high";
  if (distinct > 20) return "medium";
  return "low";
}

type MutableProfile = {
  nonNull: number; types: Set<string>; distinct: Set<number>;
  groups: Map<number, number>; varying: Set<number>;
};

export class EverflowSchemaProfiler {
  readonly fields: string[];
  private rows = 0;
  private profiles = new Map<string, MutableProfile>();

  constructor(fields: string[]) {
    this.fields = [...fields];
    for (const field of fields) this.profiles.set(field, { nonNull: 0, types: new Set(), distinct: new Set(), groups: new Map(), varying: new Set() });
  }

  observe(row: Record<string, string>, transactionId?: string | null) {
    this.rows++;
    const group = present(transactionId ?? row.transaction_id);
    for (const field of this.fields) {
      const value = present(row[field]);
      if (!value) continue;
      const state = this.profiles.get(field)!;
      const hashed = compactDigest(value);
      state.nonNull++;
      state.types.add(observedScalarType(value));
      state.distinct.add(hashed);
      if (group) {
        const groupHash = compactDigest(group);
        const prior = state.groups.get(groupHash);
        if (prior === undefined) state.groups.set(groupHash, hashed);
        else if (prior !== hashed) state.varying.add(groupHash);
      }
    }
  }

  finish(): FieldProfile[] {
    return this.fields.map((field) => {
      const state = this.profiles.get(field)!;
      const varyingGroups = state.varying.size;
      return {
        field, category: classifyEverflowField(field), rows: this.rows, nonNull: state.nonNull,
        nullRate: this.rows ? (this.rows - state.nonNull) / this.rows : 0,
        observedTypes: [...state.types].sort(), distinctCount: state.distinct.size,
        cardinality: cardinalityClass(state.distinct.size, state.nonNull),
        transactionGroupsObserved: state.groups.size, stableGroups: state.groups.size - varyingGroups, varyingGroups,
      };
    });
  }
}

export type ParameterObservation = { path: string; rows: number; distinctCount: number };

export class SafeParameterProfiler {
  private observations = new Map<string, { rows: number; distinct: Set<number> }>();
  observe(field: string, raw: string) {
    const value = present(raw); if (!value || value.length > 32_768) return;
    const record = (path: string, candidate: string) => {
      const normalized = present(candidate); if (!normalized) return;
      const state = this.observations.get(path) ?? { rows: 0, distinct: new Set<number>() };
      state.rows++; state.distinct.add(compactDigest(normalized)); this.observations.set(path, state);
    };
    try {
      const url = new URL(value);
      for (const [key, candidate] of url.searchParams) record(`${field}.query.${key.toLowerCase()}`, candidate);
      return;
    } catch { /* not an absolute URL */ }
    if (/^\??[A-Za-z0-9_.-]{1,64}=[^\s]+(?:&[A-Za-z0-9_.-]{1,64}=[^\s]+)*$/.test(value) && value.length < 8_192) {
      const query = value.startsWith("?") ? value.slice(1) : value;
      const params = new URLSearchParams(query);
      if ([...params].length) for (const [key, candidate] of params) record(`${field}.query.${key.toLowerCase()}`, candidate);
    }
    if (/^[\[{]/.test(value)) {
      try {
        const parsed = JSON.parse(value);
        const walk = (node: unknown, path: string, depth: number) => {
          if (depth > 3 || node === null) return;
          if (Array.isArray(node)) return node.slice(0, 50).forEach((item) => walk(item, `${path}[]`, depth + 1));
          if (typeof node === "object") return Object.entries(node as Record<string, unknown>).slice(0, 100).forEach(([key, item]) => walk(item, `${path}.${key.toLowerCase()}`, depth + 1));
          record(path, String(node));
        };
        walk(parsed, field, 0);
      } catch { /* malformed structured value is deliberately ignored */ }
    }
  }
  finish(): ParameterObservation[] {
    return [...this.observations].map(([path, value]) => ({ path, rows: value.rows, distinctCount: value.distinct.size })).sort((a, b) => a.path.localeCompare(b.path));
  }
}

export type IdentifierComparison = {
  everflowField: string; commasField: string; everflowCoverage: number; commasCoverage: number;
  exactMatches: number; uniqueOneToOne: number; oneToMany: number; manyToOne: number;
  collisionRate: number; deterministic: boolean;
};

export function compareOpaqueIdentifiers(input: {
  everflowField: string; commasField: string; everflowValues: string[]; commasValues: string[];
}): IdentifierComparison {
  const counts = (values: string[]) => { const result = new Map<string, number>(); for (const raw of values) { const value = present(raw); if (value) result.set(digest(value), (result.get(digest(value)) ?? 0) + 1); } return result; };
  const everflow = counts(input.everflowValues), commas = counts(input.commasValues);
  let exactMatches = 0, uniqueOneToOne = 0, oneToMany = 0, manyToOne = 0;
  for (const [value, eCount] of everflow) {
    const cCount = commas.get(value) ?? 0;
    if (!cCount) continue;
    exactMatches += Math.min(eCount, cCount);
    if (eCount === 1 && cCount === 1) uniqueOneToOne++;
    else if (eCount === 1) oneToMany++;
    else if (cCount === 1) manyToOne++;
  }
  const matchedKeys = [...everflow.keys()].filter((value) => commas.has(value)).length;
  const collisions = oneToMany + manyToOne;
  return {
    everflowField: input.everflowField, commasField: input.commasField,
    everflowCoverage: everflow.size, commasCoverage: commas.size, exactMatches, uniqueOneToOne, oneToMany, manyToOne,
    collisionRate: matchedKeys ? collisions / matchedKeys : 0,
    deterministic: uniqueOneToOne >= 10 && collisions === 0 && uniqueOneToOne / Math.min(everflow.size, commas.size) >= .01,
  };
}

export type AttributionProvenance = "direct" | "propagated_within_journey" | "inferred" | "unattributed";
export function classifyAttributionProvenance(input: { sharedIdentifier: boolean; journeySeed: boolean; evidenceRule: boolean }): AttributionProvenance {
  if (input.sharedIdentifier) return "direct";
  if (input.journeySeed) return "propagated_within_journey";
  if (input.evidenceRule) return "inferred";
  return "unattributed";
}

export function classifyNandiFailure(input: { contactCandidates: number; dateCandidates: number; amountCandidates: number; productCompatible: boolean; identifierMatch: boolean }):
  "contact_mismatch" | "date_mismatch" | "missing_compatible_amount" | "product_mismatch" | "multiple_candidates" | "identifier_absence" {
  if (!input.contactCandidates) return "contact_mismatch";
  if (!input.dateCandidates) return "date_mismatch";
  if (!input.amountCandidates) return "missing_compatible_amount";
  if (!input.productCompatible) return "product_mismatch";
  if (input.amountCandidates > 1) return "multiple_candidates";
  return input.identifierMatch ? "multiple_candidates" : "identifier_absence";
}

export function compareInvestigationVersions<T extends Record<string, number>>(before: T, after: T) {
  return Object.fromEntries(Object.keys(before).sort().map((key) => [key, after[key] === before[key] ? "unchanged" : after[key] > before[key] ? "strengthened" : "weakened"]));
}

export function normalizeHistoricalEverflowReportTime(value: string): string {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (!match) throw new Error("Historical Everflow timestamp must be timezone-naive report time.");
  const [, year, month, date, hour, minute, second] = match;
  // The report-period calibration establishes UTC-04:00 wall time. This is
  // intentionally not a provider-wide or DST-general timezone assumption.
  return new Date(Date.UTC(+year, +month - 1, +date, +hour, +minute, +second) + 240 * 60_000).toISOString();
}

export function summarizeTransactionGroup(events: { transactionId: string; conversionId: string; eventName: string; saleAmount: number | null; revenue: number | null }[]) {
  return {
    eventCount: events.length,
    transactionCount: new Set(events.map((event) => event.transactionId)).size,
    conversionCount: new Set(events.map((event) => event.conversionId)).size,
    eventNameCount: new Set(events.map((event) => event.eventName)).size,
    saleAmountVaries: new Set(events.flatMap((event) => event.saleAmount === null ? [] : [event.saleAmount])).size > 1,
    revenueVaries: new Set(events.flatMap((event) => event.revenue === null ? [] : [event.revenue])).size > 1,
  };
}

export function uniquelyClaimedJourneyLinks(candidates: { journeyId: string; orderId: string }[]) {
  const claims = new Map<string, Set<string>>();
  for (const candidate of candidates) { const journeys = claims.get(candidate.orderId) ?? new Set<string>(); journeys.add(candidate.journeyId); claims.set(candidate.orderId, journeys); }
  return candidates.filter((candidate) => claims.get(candidate.orderId)?.size === 1);
}
