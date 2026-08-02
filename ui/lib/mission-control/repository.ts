import type { MissionControlSnapshot } from "./types";

export interface MissionControlRepository {
  getMissionControl(): Promise<MissionControlSnapshot>;
}
