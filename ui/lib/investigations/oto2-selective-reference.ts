import type { InvestigationPresentation } from "./presentation";
import { ACCUFY_INVESTIGATION_ID, ACCUFY_VERSION_ID } from "./accufy-reference";

export const OTO2_CHILD_INVESTIGATION_ID = "a2200e00-0000-4000-8000-000000000101";
export const OTO2_CHILD_RUN_ID = "a2200e00-0000-4000-8000-000000000102";
export const OTO2_CHILD_VERSION_ID = "a2200e00-0000-4000-8000-000000000103";
export const OTO2_PARENT_INVESTIGATION_ID = ACCUFY_INVESTIGATION_ID;
export const OTO2_PARENT_VERSION_ID = ACCUFY_VERSION_ID;

export const OTO2_CHILD_WARNINGS = [
  { code:"small_affected_cohort",message:"The affected cohort contains 12 Journeys; percentage differences are unstable." },
  { code:"affiliate_analysis_limited",message:"Source-controlled analysis fragments the affected cohort below a useful size." },
  { code:"historical_funnel_evidence_absent",message:"Historical browser, upsell-presentation, disclosure, and consent Evidence is unavailable." },
  { code:"descriptor_evidence_absent",message:"No historical billing or merchant descriptor shown to the customer is available." },
] as const;

export const OTO2_CHILD_PRESENTATION: InvestigationPresentation = {
  question:"Why do some Main + OTO2 buyers dispute only the OTO2 charge?",
  executiveFinding:"Selective OTO2 disputes are observable in the linked historical cohort, but the affected population is small. Most Journey characteristics do not distinguish these customers from comparable Main + OTO2 buyers who disputed neither charge. The strongest remaining signal is a higher share of fraud/unauthorized and recognition-adjacent dispute reasons. Current Evidence supports further investigation of charge recognition or the historical OTO2 upsell experience, not a causal conclusion.",
  period:"Version 3 attribution-eligible historical cohort",
  evidenceQuality:[
    {label:"Linked Main + OTO2 Journeys",value:"210",detail:"Parent Version 3 Evidence window"},
    {label:"Affected",value:"12",detail:"OTO2 disputed; main undisputed",warning:"Small sample"},
    {label:"Primary control",value:"156",detail:"Neither charge disputed"},
    {label:"Both disputed",value:"40",detail:"Secondary descriptive cohort"},
    {label:"Main-only disputed",value:"2",warning:"Insufficient sample for inference"},
    {label:"Eligible OTO2 attribution",value:"12.33%",detail:"213 / 1,727 eligible OTO2 Orders"},
    {label:"Affected source attribution",value:"12 / 12",detail:"Source-controlled subsets remain too small"},
  ],
  outcome:{
    metrics:[
      {label:"OTO2-only incidence",value:"5.71%",detail:"12 / 210 linked Journeys"},
      {label:"Main retained",value:"11 / 12",detail:"Financially retained through available Evidence"},
      {label:"Affected OTO2 lag",value:"15.59 days",detail:"Median charge → dispute"},
      {label:"Fraud/unauthorized",value:"5 / 12",detail:"41.7%; limited hypothesis signal"},
    ],
    statuses:[
      {label:"OTO2 only disputed",count:12,percent:"5.71%"},{label:"Neither disputed",count:156,percent:"74.29%"},
      {label:"Both disputed",count:40,percent:"19.05%"},{label:"Main only disputed",count:2,percent:"0.95%"},
    ],
    maturityWarning:"This is an attribution-covered historical subset. It must not be generalized to all 2,968 all-time OTO2 Orders.",
  },
  concentration:[
    {subject:"Reason mix",signal:"41.7% fraud/unauthorized",sample:"5 / 12 affected versus 5 / 41 both-disputed OTO2 rows",interpretation:"Strongest observed difference; limited by sample size and multiple comparisons.",warning:"Correlation, not causation."},
    {subject:"Main-charge retention",signal:"11 / 12 retained",sample:"Affected main charges",interpretation:"Financial retention through available Evidence; not satisfaction or usage."},
    {subject:"Journey structure",signal:"No clear difference",sample:"12 affected / 156 control",interpretation:"Timing, charge count, dominant sequence, and amount overlap."},
  ],
  journey:[
    {label:"Everflow acquisition",state:"observed",detail:"Historical acquisition Journey and traffic metadata."},
    {label:"Main charge",state:"observed",detail:"Push Button System charge remains distinct."},
    {label:"OTO1 / intermediate",state:"propagated",detail:"Present in the dominant three-charge sequence."},
    {label:"OTO2 charge",state:"propagated",detail:"Same-Person, uniquely claimed V2 Journey propagation."},
    {label:"OTO2 dispute",state:"observed",detail:"High/medium historical dispute match retained."},
    {label:"Upsell presentation",state:"missing",detail:"No historical impression, copy, disclosure, consent, or descriptor Evidence."},
  ],
  multiCharge:[],
  comparison:[
    {metric:"Main → OTO2 median",subject:"6.02m",control:"6.53m",delta:"−0.51m",finding:"No material speed difference."},
    {metric:"Three-charge Journey",subject:"91.7%",control:"96.8%",delta:"−5.1 pp",finding:"Charge count does not distinguish the cohorts."},
    {metric:"Dominant sequence",subject:"91.7%",control:"88.5%",delta:"+3.2 pp",finding:"The same Main → OTO1-gold → OTO2 sequence dominates."},
    {metric:"Median total amount",subject:"$702",control:"$726",delta:"−$24",finding:"Amount distributions overlap; affected is not higher."},
    {metric:"Any refund",subject:"1 / 12",control:"6 / 156",delta:"Fragile",finding:"Refund Evidence is too sparse to differentiate."},
    {metric:"Any prior Order",subject:"2 / 12",control:"23 / 156",delta:"Small",finding:"Zero-heavy Commerce history does not distinguish cohorts."},
  ],
  findings:[
    {id:"selective-behavior",kind:"observation",title:"Selective OTO2 dispute behavior exists",statement:"Twelve linked Journeys dispute OTO2 while leaving the main charge undisputed; eleven main charges remain financially retained through available Evidence.",metric:"12 / 210",sample:"210 linked Journeys",quality:"limited",provenance:"mixed",algorithmVersion:"oto2-selective-v1"},
    {id:"reason-mix",kind:"correlation",title:"Affected reason mix is more fraud/unauthorized-heavy",statement:"Fraud/unauthorized reasons are 5/12 affected versus 5/41 both-disputed OTO2 rows; the exact exploratory comparison is approximately p=0.036.",metric:"41.7% vs 12.2%",sample:"12 affected",control:"41 both-disputed OTO2 rows",quality:"limited",provenance:"mixed",algorithmVersion:"oto2-selective-v1"},
    {id:"journey-negative",kind:"negative_finding",title:"Observed Journey structure does not clearly differentiate",statement:"Timing, charge count, dominant Product sequence, total amount, traffic fingerprint, refunds, prior history, and dispute lag do not provide a clear separator.",sample:"12 affected",control:"156 neither-disputed",quality:"limited",provenance:"mixed",algorithmVersion:"oto2-selective-v1"},
    {id:"recognition-hypothesis",kind:"hypothesis",title:"Charge recognition or OTO2 offer experience may contribute",statement:"Selective retention and reason evidence justify prospective investigation, but historical sources cannot observe the presentation, disclosure, consent, or descriptor shown.",quality:"limited",provenance:"unattributed",algorithmVersion:"oto2-selective-v1"},
  ],
  weakenedHypotheses:[
    {hypothesis:"Unusually rapid OTO2 charging distinguishes affected Journeys",evidence:"Median main → OTO2 is 6.02 versus 6.53 minutes."},
    {hypothesis:"More charges or a different Product sequence explains selective disputes",evidence:"Both cohorts are overwhelmingly three-charge Main → OTO1-gold → OTO2 Journeys."},
    {hypothesis:"Higher total spend explains selective disputes",evidence:"Affected median total is lower and distributions overlap."},
    {hypothesis:"Affiliate or traffic fingerprint identifies the affected cohort",evidence:"Source fragments and device, browser, ISP, geography, and IP evidence do not differentiate defensibly."},
    {hypothesis:"Refund or prior customer history explains the cohort",evidence:"Both dimensions are sparse and zero-heavy."},
  ],
  currentHypotheses:[{hypothesis:"Charge recognition or historical OTO2 upsell-experience effect",for:"Selective OTO2 behavior, 11/12 retained main charges, and higher recognition-adjacent reason share.",against:"Timing, sequence, count, amount, lag, and traffic are similar; five reasons remain General.",missing:"Upsell impression, offer version, price/terms, acceptance, consent, descriptor, confirmation, support, and Product-access Evidence.",status:"Historical Evidence ceiling reached · prospective Evidence required"}],
  evidenceGaps:["OTO2 upsell impression","Exact offer/copy version","Price, terms, and recurring status shown","CTA acceptance or decline","Disclosure and consent version","Billing or merchant descriptor shown","Confirmation and receipt delivery","Cross-domain Journey continuity","Support interaction","Product access or consumption"],
  nextQuestions:["Do prospective OTO2 buyers who later dispute receive or interact with a materially different upsell presentation?"],
  provenance:{sources:["Commas Transactions","Commas embedded Refunds","Resolution Center historical export","Everflow historical report"],evidenceRecords:"Protected Evidence references; raw payloads excluded from this presentation",disputeRule:"historical-dispute-reconciliation-v1",journeyRule:"everflow-commerce-v2",attribution:[{label:"Parent Investigation",count:"Version 3"},{label:"Affected",count:"12"},{label:"Primary control",count:"156"}],analyzedAt:"2026-08-08T22:00:00.000Z"},
  methodology:["The branch uses only V2-linked acquisition Journeys containing both Push Button System and OTO2-platinum.","Affected means OTO2 disputed and main undisputed; the primary control has neither charge disputed.","High and medium historical dispute matches are defensible; ambiguous rows are not forced.","Distributions and exact small-sample comparisons are reported with n=12 kept visible.","Commerce history outside the Everflow window is labeled separately from attribution Evidence.","The historical Evidence ceiling is explicit; no weaker matching is introduced.","Correlation and hypothesis do not establish causation."],
};
