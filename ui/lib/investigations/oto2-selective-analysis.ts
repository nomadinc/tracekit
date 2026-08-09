export type SelectiveOutcome = "oto2_only" | "neither" | "both" | "main_only";
export type FindingClassification = "observation" | "correlation" | "negative_finding" | "hypothesis";

export type SelectiveJourneyOrder = {
  id: string;
  organizationId: string;
  connectionId: string;
  personId: string;
  title: string;
  occurredAt: string;
  amount: number;
  evidenceId: string;
  disputed: boolean;
  refunded?: boolean;
};

export type SelectiveJourney = {
  id: string;
  organizationId: string;
  connectionId: string;
  orders: SelectiveJourneyOrder[];
};

export function classifySelectiveOutcome(mainDisputed: boolean, oto2Disputed: boolean): SelectiveOutcome {
  if (oto2Disputed && !mainDisputed) return "oto2_only";
  if (!oto2Disputed && !mainDisputed) return "neither";
  if (oto2Disputed && mainDisputed) return "both";
  return "main_only";
}

export function validateSelectiveJourney(journey: SelectiveJourney, claimedOrderIds: Set<string>): void {
  if (!journey.orders.length) throw new Error("Journey has no Orders.");
  const people = new Set(journey.orders.map(order => order.personId));
  if (people.size !== 1) throw new Error("Journey crosses People.");
  for (const order of journey.orders) {
    if (order.organizationId !== journey.organizationId || order.connectionId !== journey.connectionId) throw new Error("Journey crosses tenant scope.");
    if (!order.evidenceId) throw new Error("Journey Order is missing Evidence.");
    if (claimedOrderIds.has(order.id)) throw new Error("Order is claimed by multiple Journeys.");
  }
  const titles = new Set(journey.orders.map(order => order.title));
  if (!titles.has("Push Button System") || !titles.has("OTO2-platinum")) throw new Error("Journey is outside the Main+OTO2 cohort.");
  journey.orders.forEach(order => claimedOrderIds.add(order.id));
}

export function journeyOutcome(journey: SelectiveJourney): SelectiveOutcome {
  const mainDisputed = journey.orders.some(order => order.title === "Push Button System" && order.disputed);
  const oto2Disputed = journey.orders.some(order => order.title === "OTO2-platinum" && order.disputed);
  return classifySelectiveOutcome(mainDisputed, oto2Disputed);
}

export function productSequence(journey: SelectiveJourney): string[] {
  return [...journey.orders].sort((a,b)=>new Date(a.occurredAt).getTime()-new Date(b.occurredAt).getTime() || a.id.localeCompare(b.id)).map(order=>order.title);
}

export function mainToOto2Minutes(journey: SelectiveJourney): number {
  const main = journey.orders.filter(order=>order.title === "Push Button System").map(order=>new Date(order.occurredAt).getTime()).sort((a,b)=>a-b)[0];
  const oto2 = journey.orders.filter(order=>order.title === "OTO2-platinum").map(order=>new Date(order.occurredAt).getTime()).sort((a,b)=>a-b)[0];
  if (!Number.isFinite(main) || !Number.isFinite(oto2)) throw new Error("Journey timing is incomplete.");
  return (oto2-main)/60_000;
}

export function elapsedBucket(minutes: number): "<1m" | "1-2m" | "2-5m" | "5-10m" | "10-30m" | ">30m" {
  if (minutes < 1) return "<1m";
  if (minutes < 2) return "1-2m";
  if (minutes < 5) return "2-5m";
  if (minutes < 10) return "5-10m";
  if (minutes < 30) return "10-30m";
  return ">30m";
}

export function percentile(values: number[], p: number): number {
  if (!values.length || p < 0 || p > 1 || values.some(value=>!Number.isFinite(value))) throw new Error("Invalid percentile input.");
  const sorted=[...values].sort((a,b)=>a-b),position=(sorted.length-1)*p,lower=Math.floor(position),upper=Math.ceil(position);
  return sorted[lower]+(sorted[upper]-sorted[lower])*(position-lower);
}

export function summarize(values: number[]) {
  return { n: values.length, mean: values.reduce((sum,value)=>sum+value,0)/values.length, p25: percentile(values,.25), median: percentile(values,.5), p75: percentile(values,.75), p90: percentile(values,.9) };
}

function logFactorial(value: number): number { let total=0; for(let index=2;index<=value;index+=1) total+=Math.log(index); return total; }
function hypergeometric(a:number,b:number,c:number,d:number):number {
  const n=a+b+c+d;
  return Math.exp(logFactorial(a+b)+logFactorial(c+d)+logFactorial(a+c)+logFactorial(b+d)-logFactorial(n)-logFactorial(a)-logFactorial(b)-logFactorial(c)-logFactorial(d));
}

export function fisherExactTwoSided(a:number,b:number,c:number,d:number):number {
  if (![a,b,c,d].every(value=>Number.isInteger(value)&&value>=0)) throw new Error("Invalid contingency table.");
  const row1=a+b,col1=a+c,col2=b+d,min=Math.max(0,row1-col2),max=Math.min(row1,col1),observed=hypergeometric(a,b,c,d);
  let result=0;
  for(let candidate=min;candidate<=max;candidate+=1){const probability=hypergeometric(candidate,row1-candidate,col1-candidate,(a+b+c+d)-row1-col1+candidate);if(probability<=observed+1e-12)result+=probability;}
  return Math.min(1,result);
}

export function compareBinary(affectedTrue:number,affectedTotal:number,controlTrue:number,controlTotal:number) {
  if (affectedTotal<=0 || controlTotal<=0 || affectedTrue<0 || controlTrue<0 || affectedTrue>affectedTotal || controlTrue>controlTotal) throw new Error("Invalid cohort counts.");
  return {
    affectedRate: affectedTrue/affectedTotal,
    controlRate: controlTrue/controlTotal,
    delta: affectedTrue/affectedTotal-controlTrue/controlTotal,
    exactP: fisherExactTwoSided(affectedTrue,affectedTotal-affectedTrue,controlTrue,controlTotal-controlTrue),
    affectedN: affectedTotal,
    controlN: controlTotal,
  };
}

export type SelectiveReasonFamily = "general" | "fraud_or_unauthorized" | "product_not_received" | "credit_not_processed" | "duplicate" | "unrecognized_or_cardholder_dispute" | "product_quality" | "other";
export function normalizeSelectiveReason(raw:string):SelectiveReasonFamily {
  const value=raw.trim().toLowerCase();
  if(value==="general")return "general";
  if(value.includes("fraud")||value.includes("authorization"))return "fraud_or_unauthorized";
  if(value.includes("not_received")||value.includes("not received"))return "product_not_received";
  if(value.includes("credit"))return "credit_not_processed";
  if(value.includes("duplicate"))return "duplicate";
  if(value.includes("unrecognized")||value.includes("cardholder dispute"))return "unrecognized_or_cardholder_dispute";
  if(value.includes("damaged"))return "product_quality";
  return "other";
}

export function historyScope(orderTimestamp:string,attributionStart:string,attributionEnd:string):"inside_attribution_window"|"commerce_history_only" {
  const value=new Date(orderTimestamp).getTime();
  return value>=new Date(attributionStart).getTime()&&value<=new Date(attributionEnd).getTime()?"inside_attribution_window":"commerce_history_only";
}

export function qualityForSample(affectedN: number, coverage = 1): "limited" | "medium" {
  return affectedN < 20 || coverage < .8 ? "limited" : "medium";
}
