import type { MissionControlRepository } from "./repository";
import type { MissionControlSnapshot } from "./types";
import { mockRepositoryScopeAllows, type MockRepositoryScope } from "../identity/mock-repository-scope";

// Compatibility contract only: no seeded business or financial observations.
export class MissionControlDataUnavailableError extends Error {
  constructor() { super("Mission Control data unavailable. No observed reporting snapshot is available."); }
}
export class MockMissionControlRepository implements MissionControlRepository {
  async getMissionControl(): Promise<MissionControlSnapshot> {
    throw new MissionControlDataUnavailableError();
  }
}

export function scopeMissionControlSnapshot(
  value: MissionControlSnapshot,
  scope: MockRepositoryScope,
): MissionControlSnapshot | null {
  if (!mockRepositoryScopeAllows(scope, "offers.view")) return null;
  const includes = (businessContextId?: string) =>
    Boolean(businessContextId && scope.accessibleOfferIds.includes(businessContextId));
  const scoped = structuredClone(value);
  scoped.businesses = scoped.businesses.filter((item) => includes(item.businessContextId));
  scoped.attention = scoped.attention.filter((item) => includes(item.businessContextId));
  scoped.recentActivity = scoped.recentActivity.filter((item) => includes(item.businessContextId));
  scoped.recentSearches = scoped.recentSearches.filter((item) => includes(item.businessContextId));
  scoped.winners = [];
  return includes(scoped.continuation.businessContextId) ? scoped : null;
}

export const missionControlRepository: MissionControlRepository = new MockMissionControlRepository();
