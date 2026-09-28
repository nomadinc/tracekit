export type TkidStage1CanaryObservation={
 elapsedMinutes:number;
 newJourneys:number;
 newEvents:number;
 persistenceFailures:number;
 duplicateEventIds:number;
 orphanEvidence:number;
 orphanReservations:number;
 missingReservations:number;
 missingEvidenceOrEvents:number;
 scopeMismatches:number;
 unexpectedEventNames:number;
 nonEssentialEvents:number;
 proofOrAbuseRejections:number;
 privacyFailedObjects:number;
 originActiveVerified:boolean;
 configVersion:string;
 sdkVersion:string;
};
export type TkidStage1CanaryDecision={decision:"continue"|"stop"|"exit_success";reasons:string[]};

export const TKID_STAGE1_CANARY_CONTRACT={
 durationMinutes:60,
 observationCadenceMinutes:5,
 journeyBudget:12,
 eventBudget:60,
 expectedConfigVersion:"2",
 expectedSdkVersion:"1.1.0",
 allowedEventNames:["journey_started","page_viewed","funnel_step_viewed","cta_clicked"] as const,
 startRequires:{ingestionState:"stopped",originActiveVerified:true,privacyHealthy:true,productionM4:"pass"} as const,
 exitRequires:{ingestionState:"stopped",minimumObservationMinutes:60,persistenceIntegrity:true,privacyHealthy:true,unexpectedEventNames:0,nonEssentialEvents:0} as const,
} as const;

export function evaluateTkidStage1Canary(o:TkidStage1CanaryObservation):TkidStage1CanaryDecision{
 const reasons:string[]=[];
 if(!o.originActiveVerified)reasons.push("managed origin is not active and verified");
 if(o.configVersion!==TKID_STAGE1_CANARY_CONTRACT.expectedConfigVersion)reasons.push("browser instrumentation config drift");
 if(o.sdkVersion!==TKID_STAGE1_CANARY_CONTRACT.expectedSdkVersion)reasons.push("browser SDK version drift");
 if(o.newJourneys>TKID_STAGE1_CANARY_CONTRACT.journeyBudget)reasons.push("canary journey budget exceeded");
 if(o.newEvents>TKID_STAGE1_CANARY_CONTRACT.eventBudget)reasons.push("canary event budget exceeded");
 if(o.persistenceFailures||o.duplicateEventIds||o.orphanEvidence||o.orphanReservations||o.missingReservations||o.missingEvidenceOrEvents||o.scopeMismatches)reasons.push("persistence integrity defect observed");
 if(o.unexpectedEventNames)reasons.push("unexpected event taxonomy observed");
 if(o.nonEssentialEvents)reasons.push("non-essential event observed");
 if(o.proofOrAbuseRejections)reasons.push("proof or abuse rejection observed during canary");
 if(o.privacyFailedObjects)reasons.push("privacy executor failure observed");
 if(reasons.length)return{decision:"stop",reasons};
 if(o.elapsedMinutes>=TKID_STAGE1_CANARY_CONTRACT.durationMinutes)return{decision:"exit_success",reasons:["full observational duration completed without a stop condition"]};
 return{decision:"continue",reasons:["no stop condition observed"]};
}
