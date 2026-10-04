import type { LifecycleEvidence } from "./governed-action-history";

const M3_ARTIFACT="docs/workstreams/evidence/WS-019_M3_SHOPIFY_PRODUCTION_ACCEPTANCE.json";
const M3_INTENT="1c07429f-ccce-4b9f-9fa3-88b912fac422";

export function certifiedHistoricalEvidence(intentId:string):{providerReadBack:LifecycleEvidence;replayOccurrence:LifecycleEvidence}|null{
  if(intentId!==M3_INTENT)return null;
  return{
    providerReadBack:{availability:"certification_artifact_only",sourceType:"certification_artifact",sourceIds:[M3_ARTIFACT,"controlledExecutionCapture.freshPostExecutionProviderList"],timestamp:"2026-10-04T17:55:31.633Z",note:"Independent Shopify read-back is certified in the merged M3 artifact, not a native lifecycle row."},
    replayOccurrence:{availability:"certification_artifact_only",sourceType:"certification_artifact",sourceIds:[M3_ARTIFACT,"replayCapture"],timestamp:"2026-10-04T18:47:34.706Z",note:"The observed post-expiry replay is certified in the merged M3 artifact; no second execution row exists."},
  };
}
