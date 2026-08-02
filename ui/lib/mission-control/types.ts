export type MissionTone = "Healthy" | "Opportunity" | "Warning" | "Critical" | "Information";
export type BusinessMeasure = "profit" | "revenue" | "spend" | "orders" | "customers" | "roas" | "cpa";
export type BusinessRange = "7 Days" | "14 Days" | "30 Days" | "90 Days" | "Year";

export type TrendPoint = { label: string } & Record<BusinessMeasure, number>;

export type MissionItem = {
  id: string;
  business: string;
  businessContextId?: string;
  mark: string;
  title: string;
  detail: string;
  tone: MissionTone;
  action: string;
  destination: "offer" | "customer" | "order";
  question: string;
  explanation: string;
  evidence: string[];
  intelligence?: { comparison: string; recommendation: string; confidence: string };
};

export type MissionControlSnapshot = {
  generatedAt: string;
  businessHealth: { label: string; opportunities: number; warnings: number; critical: number };
  trends: Record<BusinessRange, TrendPoint[]>;
  businesses: Array<{ id: string; businessContextId: string; mark: string; name: string; profit: number; trend: number; tracking: string }>;
  briefing: { opportunities: number; warnings: number; recommendations: number; observation: string; reason: string; recommendation: string; evidence: string[] };
  attention: MissionItem[];
  winners: Array<{ label: string; value: string; detail: string }>;
  continuation: { businessContextId: string; business: string; subject: string; detail: string };
  recentActivity: Array<{ id: string; type: string; title: string; detail: string; destination: "offer" | "customer" | "order"; businessContextId?: string }>;
  recentSearches: Array<{ id: string; type: string; value: string; destination: "offer" | "customer" | "order"; businessContextId?: string }>;
};
