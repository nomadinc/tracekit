export const REMEDIATION_STATES=["healthy","eligible","blocked"]as const;
export type RemediationState=typeof REMEDIATION_STATES[number];
export function remediationNeedsAction(state:RemediationState){return state==="eligible";}
export type RemediationSignal={provider:string;connectionId:string|null;operation:string;state:RemediationState;reason:string;observedAt:string;evidence:Record<string,unknown>};
export function remediationSignal(input:RemediationSignal){if(!input.provider||!input.operation||!input.reason||!input.observedAt)throw new Error("remediation_signal_incomplete");return{...input,actionRequired:remediationNeedsAction(input.state)};}
