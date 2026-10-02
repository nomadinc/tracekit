export const REMEDIATION_STATES=["healthy","eligible","blocked"]as const;
export type RemediationState=typeof REMEDIATION_STATES[number];
export function remediationNeedsAction(state:RemediationState){return state==="eligible";}
