/** Read-only, sanitized aggregation of normalized Commas checkout observations. */
export type QualityObservation = {
  id: string; eventId: string; evidenceId: string; observedAt: string;
  webhookObservedAt?: string | null;
  paymentId: string | null; canonicalOrderId: string | null;
  matchState: string; aliasState: string; comparisonState: string;
  affiliateId: string | null; sub1: string | null; sub4: string | null;
  efTransactionId: string | null; transactionId: string | null; tid: string | null; c1: string | null;
  evidenceNormalizerVersion: string | null; normalizerVersion?: string | null; reconciliationVersion: string | null;
  journeyCreatedAt: string | null; comparison: { matched_fields?: string[]; conflicting_fields?: string[] } | null;
  everflow?: { transactionId: string | null; affiliateId: string | null; sub1: string | null; sub4: string | null } | null;
  paymentPath?: string | null;
  ordMappingCreatedAt?: string | null;
};

const aliases = ["efTransactionId", "transactionId", "tid", "c1"] as const;
const fields = ["affiliateId", "sub1", "sub4", ...aliases] as const;
const comparisons = ["exact_match", "partial_match", "conflict", "no_everflow_record", "no_commas_tid", "not_evaluated"] as const;
const states = ["all_agree", "single_alias", "conflict", "none"] as const;
const ordPattern = /^ORD-[A-Za-z0-9_-]{1,120}$/;
const count = (rows: QualityObservation[], predicate: (row: QualityObservation) => boolean) => rows.filter(predicate).length;
const percentage = (part: number, total: number) => total ? Math.round(part / total * 1000) / 10 : 0;
const validField = (value: unknown) => typeof value === "string" && value.length > 0;
function latency(rows: QualityObservation[], endpoint: (row: QualityObservation) => string | null | undefined) {
  const values = rows.map(row => {
    const from = Date.parse(row.webhookObservedAt || ""), to = Date.parse(endpoint(row) || "");
    return Number.isFinite(from) && Number.isFinite(to) ? Math.max(0, Math.round((to - from) / 1000)) : null;
  }).filter((value): value is number => value !== null).sort((a, b) => a - b);
  if (!values.length) return { measured: 0, medianSeconds: null, p95Seconds: null, maxSeconds: null };
  return { measured: values.length, medianSeconds: values[Math.floor((values.length - 1) * .5)], p95Seconds: values[Math.ceil(values.length * .95) - 1], maxSeconds: values[values.length - 1] };
}

export function aliasDisagreements(row: QualityObservation) {
  const present = aliases.filter(key => validField(row[key]));
  if (new Set(present.map(key => row[key])).size <= 1) return [];
  const reference = row[present[0]];
  return present.filter(key => row[key] !== reference).map(key => key === "efTransactionId" ? "_ef_transaction_id" : key);
}

export function aggregateCommasAttributionQuality(rows: QualityObservation[], options: { cutoverAt?: string | null; receivedDeliveries?: number; latestSyncCompletedAt?: string | null; now?: string } = {}) {
  const total = rows.length;
  const dayMap = new Map<string, QualityObservation[]>();
  for (const row of rows) {
    const day = row.observedAt.slice(0, 10);
    dayMap.set(day, [...(dayMap.get(day) || []), row]);
  }
  const parameterCoverage = Object.fromEntries(fields.map(field => {
    const present = count(rows, row => validField(row[field]));
    return [field === "affiliateId" ? "affid" : field === "efTransactionId" ? "_ef_transaction_id" : field, { count: present, percentage: percentage(present, total) }];
  }));
  const aliasCount = Object.fromEntries(states.map(state => [state, { count: count(rows, row => row.aliasState === state), percentage: percentage(count(rows, row => row.aliasState === state), total) }]));
  const comparisonCount = Object.fromEntries(comparisons.map(state => [state, { count: count(rows, row => row.comparisonState === state), percentage: percentage(count(rows, row => row.comparisonState === state), total) }]));
  const exact = count(rows, row => row.matchState === "exact");
  const unmatchedReasons = { transactionNotIngestedYet: 0, ordMappingAbsent: 0, canonicalOrderAbsent: 0, malformedProviderIdentity: 0, conflictingIdentity: 0, unknown: 0 };
  for (const row of rows.filter(item => item.matchState !== "exact")) {
    if (!ordPattern.test(row.paymentId || "")) unmatchedReasons.malformedProviderIdentity++;
    else if (row.matchState === "ambiguous") unmatchedReasons.conflictingIdentity++;
    else if (row.ordMappingCreatedAt && !row.canonicalOrderId) unmatchedReasons.canonicalOrderAbsent++;
    else if (!row.ordMappingCreatedAt && options.latestSyncCompletedAt && row.webhookObservedAt && Date.parse(row.webhookObservedAt) > Date.parse(options.latestSyncCompletedAt)) unmatchedReasons.transactionNotIngestedYet++;
    else if (!row.ordMappingCreatedAt) unmatchedReasons.ordMappingAbsent++;
    else unmatchedReasons.unknown++;
  }
  const postCutover = options.cutoverAt ? count(rows, row => Boolean(row.webhookObservedAt) && Date.parse(row.webhookObservedAt!) >= Date.parse(options.cutoverAt!)) : null;
  const firstAt = rows.map(row => row.observedAt).sort()[0] || null;
  const lastAt = rows.map(row => row.observedAt).sort().at(-1) || null;
  const maturity = postCutover !== null && postCutover >= 500 ? "DECISION_GATE_REACHED" : total ? "MEASUREMENT_ACTIVE" : "INSUFFICIENT_SAMPLE";
  const linked = rows.filter(row => row.everflow);
  const fieldAgreement = Object.fromEntries((["transactionId", "affiliateId", "sub1", "sub4"] as const).map(field => {
    const left = (row: QualityObservation) => field === "transactionId" ? row.efTransactionId || row.transactionId || row.tid || row.c1 : row[field];
    const both = linked.filter(row => validField(left(row)) && validField(row.everflow?.[field]));
    return [field, {
      linkedPopulation: linked.length, comparable: both.length,
      agree: both.filter(row => left(row) === row.everflow?.[field]).length,
      disagree: both.filter(row => left(row) !== row.everflow?.[field]).length,
      commasMissing: count(linked, row => !validField(left(row)) && validField(row.everflow?.[field])),
      everflowMissing: count(linked, row => validField(left(row)) && !validField(row.everflow?.[field])),
      bothMissing: count(linked, row => !validField(left(row)) && !validField(row.everflow?.[field])),
    }];
  }));
  const paths = Array.from(new Set(rows.map(row => row.paymentPath || "unknown"))).sort();
  return {
    mode: "SHADOW_MEASUREMENT", creditImpact: "NONE", total, firstAt, lastAt,
    funnel: {
      receivedDeliveries: options.receivedDeliveries ?? null,
      signatureAccepted: options.receivedDeliveries ?? null,
      evidence: count(rows, row => validField(row.evidenceId)), observation: total,
      paymentPresent: count(rows, row => validField(row.paymentId)),
      validOrd: count(rows, row => ordPattern.test(row.paymentId || "")),
      exactOrd: exact, canonicalOrder: count(rows, row => validField(row.canonicalOrderId)),
      attributionPresent: count(rows, row => fields.some(field => validField(row[field]))),
      everflowComparable: count(rows, row => ["exact_match", "partial_match", "conflict"].includes(row.comparisonState)),
      journeyShadow: count(rows, row => validField(row.journeyCreatedAt)),
    },
    ord: { exact, unmatched: count(rows, row => row.matchState === "unmatched"), ambiguous: count(rows, row => row.matchState === "ambiguous"), malformed: count(rows, row => row.matchState === "malformed"), matchRate: percentage(exact, total), unmatchedReasons },
    parameters: { ...parameterCoverage,
      anyAlias: count(rows, row => aliases.some(key => validField(row[key]))),
      allAliases: count(rows, row => aliases.every(key => validField(row[key]))),
      anyField: count(rows, row => fields.some(key => validField(row[key]))),
      noFields: count(rows, row => fields.every(key => !validField(row[key]))),
    },
    aliases: aliasCount, everflow: comparisonCount,
    comparisonFreshness: { storedNoRecordNowLinked: count(rows, row => row.comparisonState === "no_everflow_record" && Boolean(row.everflow)) },
    fieldAgreement,
    paymentPaths: paths.map(path => {
      const group = rows.filter(row => (row.paymentPath || "unknown") === path);
      return { path, purchases: group.length, ordMatchRate: percentage(count(group, row => row.matchState === "exact"), group.length),
        transactionCoverage: percentage(count(group, row => aliases.some(key => validField(row[key]))), group.length),
        affiliateCoverage: percentage(count(group, row => validField(row.affiliateId)), group.length),
        everflowComparableRate: percentage(count(group, row => Boolean(row.everflow)), group.length),
        everflowExactRate: percentage(count(group, row => row.comparisonState === "exact_match"), group.length),
        everflowConflictRate: percentage(count(group, row => row.comparisonState === "conflict"), group.length) };
    }),
    noTid: {
      purchases: count(rows, row => row.aliasState === "none"),
      exactOrd: count(rows, row => row.aliasState === "none" && row.matchState === "exact"),
      affiliatePresent: count(rows, row => row.aliasState === "none" && validField(row.affiliateId)),
      sub1Present: count(rows, row => row.aliasState === "none" && validField(row.sub1)),
      sub4Present: count(rows, row => row.aliasState === "none" && validField(row.sub4)),
      everflowLinked: count(rows, row => row.aliasState === "none" && Boolean(row.everflow)),
    },
    latency: { webhookToOrdAvailable: latency(rows, row => row.ordMappingCreatedAt), webhookToJourneyShadow: latency(rows, row => row.journeyCreatedAt),
      liveV2: { webhookToOrdAvailable: latency(rows.filter(row => row.evidenceNormalizerVersion === "commas-provider-attribution-v2"), row => row.ordMappingCreatedAt), webhookToJourneyShadow: latency(rows.filter(row => row.evidenceNormalizerVersion === "commas-provider-attribution-v2"), row => row.journeyCreatedAt) },
      webhookToFirstExactMatch: null },
    provenance: {
      evidenceReconciled: count(rows, row => row.evidenceNormalizerVersion === "commas-provider-attribution-v1"),
      liveNormalizer: count(rows, row => row.evidenceNormalizerVersion === "commas-provider-attribution-v2"),
      laterReconciled: count(rows, row => row.evidenceNormalizerVersion === "commas-provider-attribution-v1" && row.normalizerVersion === "commas-provider-attribution-v2"),
    },
    daily: Array.from(dayMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, dayRows]) => ({
      date, purchases: dayRows.length,
      ordExactRate: percentage(count(dayRows, row => row.matchState === "exact"), dayRows.length),
      transactionIdCoverage: percentage(count(dayRows, row => aliases.some(key => validField(row[key]))), dayRows.length),
      affiliateCoverage: percentage(count(dayRows, row => validField(row.affiliateId)), dayRows.length),
      aliasConflictRate: percentage(count(dayRows, row => row.aliasState === "conflict"), dayRows.length),
      everflowExactRate: percentage(count(dayRows, row => row.comparisonState === "exact_match"), dayRows.length),
      everflowConflictRate: percentage(count(dayRows, row => row.comparisonState === "conflict"), dayRows.length),
    })),
    conflicts: rows.filter(row => row.aliasState === "conflict" || row.comparisonState === "conflict").slice(0, 50).map(row => ({
      eventReference: row.id, eventAt: row.observedAt,
      derivationMode: row.evidenceNormalizerVersion === "commas-provider-attribution-v1" ? "reconciled" : "live",
      ordMatchState: row.matchState, aliasState: row.aliasState, comparisonState: row.comparisonState,
      conflictingAliases: aliasDisagreements(row),
      conflictingFields: (row.comparison?.conflicting_fields || []).filter(field => ["transaction_id", "affiliate_id", "sub1", "sub4", "ambiguous_everflow_identity"].includes(field)),
      diagnosticStatus: "unreviewed",
    })),
    maturity: { sample: total, postCutover, confirmedLiveV2: count(rows, row => row.evidenceNormalizerVersion === "commas-provider-attribution-v2"), targetPurchases: 500, targetHealthyDays: 7, healthyDays: null, status: maturity },
    rejectedTraffic: { malformed: null, unverified: null, note: "No durable request-level rejection counter is available to this report." },
  };
}
