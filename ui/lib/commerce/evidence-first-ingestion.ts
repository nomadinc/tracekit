export type EvidenceFirstPageUnit<Evidence, Result> = {
  persistEvidence(): Promise<Evidence>;
  normalizeFromEvidence(evidence: Evidence): Promise<Result>;
  completeCheckpoint(result: Result): Promise<void>;
  failCheckpoint(errorCode: string): Promise<void>;
};

/** Enforces the only permitted page lifecycle: Evidence, normalization, Checkpoint. */
export async function runEvidenceFirstPage<Evidence, Result>(unit: EvidenceFirstPageUnit<Evidence, Result>) {
  try {
    const evidence = await unit.persistEvidence();
    const result = await unit.normalizeFromEvidence(evidence);
    await unit.completeCheckpoint(result);
    return result;
  } catch {
    await unit.failCheckpoint("evidence_first_page_failed");
    throw new Error("Commerce page ingestion failed safely.");
  }
}
