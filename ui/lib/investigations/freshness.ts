export type InvestigationDependency = { resourceType:string; entityType?:string|null; entityId?:string|null; periodStart?:string|null; periodEnd?:string|null };
export type EvidenceChange = { organizationId:string; resourceType:string; entityType?:string|null; entityId?:string|null; observedAt:string };

export function evidenceIntersectsDependency(change:EvidenceChange,dependency:InvestigationDependency) {
  if(change.resourceType!==dependency.resourceType)return false;
  if(dependency.entityType&&(change.entityType!==dependency.entityType||change.entityId!==dependency.entityId))return false;
  const observed=Date.parse(change.observedAt);
  if(dependency.periodStart&&observed<Date.parse(dependency.periodStart))return false;
  if(dependency.periodEnd&&observed>Date.parse(dependency.periodEnd))return false;
  return true;
}

export function investigationFreshness(input:{dependencies:InvestigationDependency[];changes:EvidenceChange[]}) {
  const relevant=input.changes.filter((change)=>input.dependencies.some((dependency)=>evidenceIntersectsDependency(change,dependency)));
  return {status:relevant.length?"new_evidence_available" as const:"current" as const,relevantChanges:relevant};
}
