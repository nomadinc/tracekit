import type { InvestigationPresentation } from "./presentation";

export const ACCUFY_INVESTIGATION_ID = "a2200e00-0000-4000-8000-000000000001";
export const ACCUFY_RUN_ID = "a2200e00-0000-4000-8000-000000000004";
export const ACCUFY_VERSION_ID = "a2200e00-0000-4000-8000-000000000005";

export const ACCUFY_WARNINGS = [
  { code: "attribution_evidence_window", message: "24,390 all-time Commerce Orders fall outside the available Everflow attribution Evidence window; they are not reconciliation failures." },
  { code: "eligible_attribution_incomplete", message: "9,875 of 50,103 attribution-eligible Orders remain without defensible acquisition attribution." },
  { code: "oto2_attribution_limited", message: "213 of 1,727 attribution-eligible OTO2 Orders have acquisition attribution; another 1,241 OTO2 Orders fall outside the Everflow Evidence window." },
  { code: "historical_time_calibration", message: "Historical Everflow timestamps required a versioned, evidence-calibrated normalization." },
  { code: "no_deterministic_order_bridge", message: "No deterministic historical Everflow-to-Commas Order identifier exists." },
  { code: "browser_journey_unavailable", message: "Browser-level Journey evidence is unavailable historically." },
] as const;

export const ACCUFY_PRESENTATION: InvestigationPresentation = {
  question: "Why are chargebacks elevated, where are they concentrated, and what Journey produced the outcome?",
  executiveFinding: "Historical evidence does not support Nandi as the primary driver of Pear Media chargebacks. Nandi shows 8.28% dispute incidence versus 9.70% for comparable other Pear traffic. The strongest unresolved Commerce signal is OTO2-platinum at 24.73%, but its affiliate attribution coverage is insufficient to assign that risk to a traffic source.",
  period: "Commerce evidence Sep 20, 2025–Aug 8, 2026 · attribution Evidence Apr 1–Aug 7, 2026 UTC",
  evidenceQuality: [
    { label: "Historical disputes", value: "11,096" },
    { label: "Defensible dispute reconciliation", value: "94.91%", detail: "10,531 defensible matches" },
    { label: "Everflow Journey reconciliation", value: "94.66%", detail: "35,809 / 37,829 Journeys" },
    { label: "Eligible Order attribution", value: "80.29%", detail: "40,228 / 50,103 eligible Orders", warning: "9,875 eligible Orders remain unattributed" },
    { label: "Outside attribution Evidence window", value: "24,390", detail: "Excluded from the 74,493 all-time Order denominator" },
    { label: "Eligible OTO2 attribution", value: "12.33%", detail: "213 / 1,727 eligible OTO2 Orders", warning: "1,241 additional OTO2 Orders are outside the Evidence window; affiliate analysis remains limited" },
    { label: "Ambiguous dispute matches", value: "511" },
    { label: "Unmatched disputes", value: "54" },
    { label: "Everflow Journey review queue", value: "797", detail: "plus 1,223 unmatched" },
  ],
  outcome: {
    metrics: [
      { label: "Historical dispute fees", value: "$397,794.61" },
      { label: "Unresolved disputed revenue", value: "$535,636.07" },
      { label: "Median purchase → dispute", value: "17 days" },
      { label: "Average purchase → dispute", value: "27.71 days" },
    ],
    statuses: [
      { label: "Lost", count: 7132, percent: "64.27%" }, { label: "Needs Response", count: 2020, percent: "18.21%" },
      { label: "Under Review", count: 1538, percent: "13.86%" }, { label: "Won", count: 406, percent: "3.66%" },
    ],
    maturityWarning: "Recent disputes received and the dispute rate of recent acquisition cohorts are different measures. Immature August cohorts are not compared directly with mature April–June cohorts.",
  },
  concentration: [
    { subject: "OTO2-platinum", signal: "24.73% historical dispute rate", sample: "734 disputes / 2,968 all-time Orders", interpretation: "Highest observed Commerce-level Product rate.", warning: "213 / 1,727 attribution-eligible Orders are attributed; affiliate analysis remains coverage-limited." },
    { subject: "Push Button System", signal: "$731,005.13 disputed evidence", sample: "6,845 disputes; 6,492 defensibly matched", interpretation: "Largest historical dispute burden, not the highest rate." },
    { subject: "Pear Media", signal: "9.21%", sample: "334 disputed / 3,626 attributed Orders", interpretation: "Meaningful volume; Nandi is not elevated against its Pear control." },
    { subject: "Nandi", signal: "8.28%", sample: "103 disputed / 1,244 Journey-linked Orders", interpretation: "Below comparable other Pear traffic." },
  ],
  journey: [
    { label: "Everflow click", state: "observed", detail: "Acquisition time and traffic metadata retained." },
    { label: "Acquisition Journey", state: "observed", detail: "Everflow Transaction treated as an acquisition/event Journey." },
    { label: "Conversion events", state: "observed", detail: "Individual source events remain distinct." },
    { label: "Commas main charge", state: "observed", detail: "Direct linkage uses exact contact and calibrated timestamp evidence." },
    { label: "Upsell / additional charges", state: "propagated", detail: "Same Person, same Connection, unique Journey claim, within ten minutes." },
    { label: "Refund", state: "observed", detail: "Included when embedded provider evidence exists." },
    { label: "Historical dispute", state: "observed", detail: "Resolution Center evidence with reconciliation confidence retained." },
    { label: "Browser funnel behavior", state: "missing", detail: "No historical first-party page, CTA, VSL, or checkout progression evidence." },
  ],
  multiCharge: [{ charges: "1 nearby charge", rate: "11.29%" }, { charges: "2 nearby charges", rate: "17.43%" }, { charges: "3 nearby charges", rate: "21.38%" }],
  comparison: [
    { metric: "Dispute incidence", subject: "8.28%", control: "9.70%", delta: "−1.42 pp", finding: "Nandi is not elevated versus comparable other Pear traffic." },
    { metric: "Mobile device mix", subject: "~94%", control: "~94%", delta: "Small", finding: "No material device difference." },
    { metric: "ISP concentration", subject: "Broad consumer traffic", control: "Broad consumer traffic", delta: "No material concentration", finding: "ISP mix does not differentiate the cohort." },
    { metric: "Repeated visitor IPs", subject: "No major cluster", control: "No major cluster", delta: "Not material", finding: "No repeated visitor-IP fraud cluster was observed." },
    { metric: "Click → purchase", subject: "Median ~42m", control: "Comparable", delta: "Not material", finding: "Short click-to-purchase behavior does not explain the difference." },
  ],
  findings: [
    { id: "oto2-rate", kind: "observation", title: "OTO2 is the strongest Commerce risk signal", statement: "OTO2-platinum has a 24.73% historical dispute rate by Order count.", metric: "734 / 2,968", sample: "2,968 all-time Orders", quality: "high", provenance: "mixed", algorithmVersion: "accufy-investigation-v3" },
    { id: "multi-charge", kind: "correlation", title: "Dispute incidence rises with nearby charge count", statement: "Historical disputed-session incidence rises from 11.29% with one nearby charge to 21.38% with three.", metric: "11.29% → 21.38%", sample: "Historical linked Journeys", quality: "medium", provenance: "mixed", algorithmVersion: "accufy-investigation-v3" },
    { id: "nandi-control", kind: "negative_finding", title: "Nandi does not uniquely explain Pear disputes", statement: "Nandi incidence is 8.28% versus 9.70% for comparable other Pear traffic.", metric: "−1.42 pp", sample: "1,244 Nandi Orders", control: "2,382 other Pear Orders", quality: "high", provenance: "mixed", algorithmVersion: "accufy-investigation-v3" },
    { id: "oto2-hypothesis", kind: "hypothesis", title: "OTO2 may reflect a Product or customer-selection effect", statement: "The elevated Commerce rate remains after comparing nearby charge position, but acquisition and first-party funnel evidence are incomplete.", quality: "limited", provenance: "unattributed", algorithmVersion: "accufy-investigation-v3" },
  ],
  weakenedHypotheses: [
    { hypothesis: "Nandi uniquely drives Pear chargebacks", evidence: "Nandi 8.28% versus other Pear 9.70%." },
    { hypothesis: "Mobile device mix explains disputes", evidence: "Affected and control mobile distributions are materially similar." },
    { hypothesis: "ISP or geographic concentration explains disputes", evidence: "No unusual concentration relative to controls." },
    { hypothesis: "Repeated visitor IPs indicate a fraud cluster", evidence: "No major repeated session-IP cluster was observed." },
    { hypothesis: "Short click-to-purchase explains disputes", evidence: "Timing is not materially different from controls." },
    { hypothesis: "Charge count alone explains OTO2", evidence: "OTO2 rates remain similar across first, second, and third nearby-charge positions." },
  ],
  currentHypotheses: [{ hypothesis: "OTO2 Product/customer-selection or offer-experience effect", for: "24.73% Commerce-level historical dispute rate.", against: "Rates are similar across nearby charge positions.", missing: "Adequate affiliate attribution and first-party upsell impression, acceptance, rejection, and funnel behavior.", status: "Needs more evidence" }],
  evidenceGaps: ["Shared historical Order/checkout identifier", "Explicit Everflow timezone", "Unambiguous historical amount semantics", "24,390 all-time Orders outside the available Everflow attribution Evidence window", "9,875 eligible Orders without defensible acquisition attribution", "Adequate OTO2 affiliate coverage", "Landing-page sequence and dwell time", "VSL progress and CTA interactions", "Checkout progression", "Upsell impression, acceptance, and rejection", "Return visits and client errors", "Cross-domain session continuity"],
  nextQuestions: ["Why does OTO2 remain above 20% across nearby charge positions?", "Does OTO2 risk persist after controlling for acquisition source when attribution coverage improves?", "Do multi-charge customers show different refund behavior?", "Which dispute-reason families dominate multi-charge Journeys?", "Are Lost disputes concentrated where fulfillment or Journey Evidence is weak?"],
  provenance: { sources: ["Commas Transactions", "Commas embedded Refunds", "Resolution Center historical export", "Everflow historical report"], evidenceRecords: "Protected Evidence references; raw payloads excluded from this presentation", disputeRule: "historical-dispute-reconciliation-v1", journeyRule: "everflow-commerce-v2", attribution: [{ label: "Order-linked eligible", count: "36,076" }, { label: "Journey-propagated eligible", count: "4,152" }, { label: "Attributed eligible", count: "40,228 / 50,103" }, { label: "Unattributed eligible", count: "9,875" }, { label: "Outside Evidence window", count: "24,390" }], analyzedAt: "2026-08-08T00:00:00.000Z" },
  methodology: ["Historical disputes are attached only when contact, date, amount, and Product evidence produce a defensible candidate.", "Everflow timestamps use a report-period, evidence-calibrated normalization recorded as a versioned rule.", "Attribution eligibility spans 2026-04-01 04:04:16Z through 2026-08-07 21:30:53Z: the normalized conversion range plus the persisted two-minute direct-match and ten-minute Journey-propagation tolerances.", "Order-linked attribution and same-Person, same-Connection, uniquely claimed Journey propagation remain distinguishable.", "Orders outside the attribution Evidence window are excluded from attribution coverage rather than labeled reconciliation failures.", "Nandi is compared with other Pear Media traffic from the comparable evidence period.", "Purchase-cohort rates are maturity-aware; recent dispute arrivals are not treated as recent-cohort rates.", "High, medium, review-required, and unmatched states retain ambiguity instead of forcing a match.", "Correlation identifies co-movement; it does not establish causation."],
};
