import "server-only";
import { commercePersistenceCount, commercePersistenceRequest } from "@/lib/commerce/supabase-control-repository";
import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import { readMissionControlPortfolio as readPortfolio } from "./portfolio-reader";
export type { MissionControlPortfolio, PortfolioMetric } from "./portfolio-reader";

export function readMissionControlPortfolio(session: TraceKitSessionContext, days = 30) {
  return readPortfolio(session, days, { request: commercePersistenceRequest, count: commercePersistenceCount });
}
