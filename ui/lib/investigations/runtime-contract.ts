import { createHash } from "node:crypto";
export type InvestigationRunRequest = {
  accountId: string; organizationId: string; investigationId: string; requestedByUserId: string;
  algorithmVersion: string; commerceVersion: string; journeyVersion: string; disputeVersion: string;
  reasonVersion: string; cohortVersion: string; sourceSnapshot: Record<string, unknown>; evidenceCutoffAt: string;
};
export function investigationRunKey(input: InvestigationRunRequest) {
  return createHash("sha256").update(JSON.stringify({ organizationId: input.organizationId, investigationId: input.investigationId, algorithmVersion: input.algorithmVersion, commerceVersion: input.commerceVersion, journeyVersion: input.journeyVersion, disputeVersion: input.disputeVersion, reasonVersion: input.reasonVersion, cohortVersion: input.cohortVersion, sourceSnapshot: input.sourceSnapshot, evidenceCutoffAt: input.evidenceCutoffAt })).digest("hex");
}
