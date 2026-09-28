import type{TraceKitSessionContext}from"@/lib/identity/persistent-types";import{orchestrateInspectEvidence,type InspectEvidenceOrchestrationInput}from"./action-orchestration";
export class TraceKitMcpActionService{constructor(private readonly session:TraceKitSessionContext){}inspectEvidence(input:InspectEvidenceOrchestrationInput){return orchestrateInspectEvidence(this.session,input);}}
