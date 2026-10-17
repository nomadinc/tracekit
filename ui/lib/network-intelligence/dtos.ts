/** M1 Security Contract Revision 2. No grants, routes or persistence integration. */
export type UTC = string;
export type ObservationId = string;
export type LocalEvidenceId = string;
export type CatalogKey = string;
export type ApprovedVersion = string;
export type Count = number;
export type Revision = number;
export type Cursor = string;
export type Freshness = "CURRENT" | "AGING" | "STALE" | "UNKNOWN";
export type TriState = "TRUE" | "FALSE" | "UNKNOWN";
export type Availability = "PRESENT" | "ABSENT" | "INVALID" | "EXPLICIT_UNKNOWN" | "CONFLICTING" | "UNSUPPORTED";
export type ConflictCode = "NONE" | "SOURCE_CONFLICT" | "ASSERTION_EVIDENCE_MISMATCH" | "INVALID_CONFLICT_REFERENCE";
export type Status = "COMPLETE" | "PARTIAL" | "OWNED_ONLY" | "PROVIDER_UNAVAILABLE" | "EXPIRED" | "UNKNOWN";
export type Stage = "OWNED" | "NETWORK_LOCAL" | "NETWORK_LIVE" | "BROWSER" | "AUTOMATION" | "BEHAVIORAL" | "DERIVATION" | "UNKNOWN";
export type Signal = "hosting" | "vpn" | "proxy" | "residentialProxy" | "mobileProxy" | "tor" | "anonymous";
export type ScalarField = "asn" | "organization" | "networkType" | "carrier" | "country" | "region";
export type SourceClass = "OWNED_AUTHORITATIVE" | "OWNED_OBSERVATION" | "LOCAL_SNAPSHOT" | "LOCAL_STALE" | "LIVE_PROVIDER" | "DERIVED" | "UNKNOWN";
export type Provider = "TRACEKIT" | "IPINFO_PLUS" | "IPINFO_RESIDENTIAL_PROXY" | "SPUR" | "OTHER";
export type ErrorCode = "PROVIDER_UNAVAILABLE" | "SNAPSHOT_UNAVAILABLE" | "COLLECTION_INCOMPLETE" | "EXPIRED" | "UNKNOWN";
export type ScopeDTO = {kind:"ORGANIZATION";workspaceId:null} | {kind:"WORKSPACE";workspaceId:string};
export type ConfidenceDTO =
  | {basis:"SOURCE_REPORTED";value:number;derivationVersion:ApprovedVersion|null}
  | {basis:"EDGE_DERIVED"|"OBSERVATION_QUALITY";value:number;derivationVersion:ApprovedVersion};
export interface SamplingDTO {population:"RECEIVED_OBSERVATIONS";historicalSamplingRate:null;estimatedVisitors:null;disclosureCode:"RECEIVED_OBSERVATIONS_NOT_TOTAL_TRAFFIC"}
export interface ContextDTO {generatedAt:UTC;snapshotAt:UTC;scope:ScopeDTO;from:UTC;toExclusive:UTC;timeBasis:"OBSERVED_AT";countBasis:"DISTINCT_OBSERVATIONS_CURRENT_RECEIVED_REVISION";sampling:SamplingDTO}
export interface PageDTO {limit:number;nextCursor:Cursor|null;hasMore:boolean}
export interface AssertionMetaDTO {availability:Availability;freshness:Freshness;conflictCode:ConflictCode;confidence:ConfidenceDTO|null}
export type ScalarDTO<T> =
  | (AssertionMetaDTO & {availability:"PRESENT";state:"KNOWN";value:T})
  | (AssertionMetaDTO & {state:"UNKNOWN";value:null;confidence:null});
export interface SignalDTO extends AssertionMetaDTO {state:TriState}
export interface NetworkDTO {
  asn:ScalarDTO<number>;organization:ScalarDTO<CatalogKey>;networkType:ScalarDTO<CatalogKey>;
  carrier:ScalarDTO<CatalogKey>;country:ScalarDTO<string>;region:ScalarDTO<CatalogKey>;
  signals:Record<Signal,SignalDTO>;
}
export interface SummaryDTO {observationId:ObservationId;revision:Revision;observedAt:UTC;sourceUpdatedAt:UTC;receivedAt:UTC;status:Status;network:NetworkDTO}
export interface EvidenceMetaDTO {id:LocalEvidenceId;provider:Provider;sourceClass:SourceClass;observedAt:UTC;sourceObservedAt:UTC|null;snapshotAt:UTC|null;freshness:Freshness;confidence:ConfidenceDTO|null}
export type EvidenceDTO = EvidenceMetaDTO & (
  | {field:Signal;value:boolean}
  | {field:"asn";value:number}
  | {field:"country";value:string}
  | {field:"organization"|"networkType"|"carrier"|"region";value:CatalogKey}
);
export interface EvidenceRefsDTO {
  asn:LocalEvidenceId[];organization:LocalEvidenceId[];networkType:LocalEvidenceId[];
  carrier:LocalEvidenceId[];country:LocalEvidenceId[];region:LocalEvidenceId[];
  hosting:LocalEvidenceId[];vpn:LocalEvidenceId[];proxy:LocalEvidenceId[];
  residentialProxy:LocalEvidenceId[];mobileProxy:LocalEvidenceId[];tor:LocalEvidenceId[];anonymous:LocalEvidenceId[];
}
export interface ErrorDTO {stage:Stage;code:ErrorCode;retryable:boolean|null}
export interface SnapshotDTO {summary:SummaryDTO;previousRevision:Revision|null;previousRevisionReceived:boolean;completedAt:UTC|null;completedStages:Stage[];pendingStages:Stage[];schemaVersion:"1.0";semanticsVersion:ApprovedVersion|null;derivationRuleVersion:ApprovedVersion|null;evidence:EvidenceDTO[];evidenceReferences:EvidenceRefsDTO;errors:ErrorDTO[]}
export type DistributionBucketDTO<T> =
  | {kind:"VALUE";value:T;observations:Count}
  | {kind:"OTHER";value:null;observations:Count}
  | {kind:"UNKNOWN";value:null;observations:Count};
export interface ProviderCoverageDTO {provider:Provider;observationsWithEvidence:Count;denominatorObservations:Count}
export interface SignalCountsDTO {trueCount:Count;falseCount:Count;unknownCount:Count;conflictingCount:Count;denominatorObservations:Count}
export interface NetworkIntelligenceOverviewDTO {context:ContextDTO;observationCount:Count;timeline:Array<{from:UTC;toExclusive:UTC;observations:Count}>;networkTypes:DistributionBucketDTO<CatalogKey>[];countries:DistributionBucketDTO<string>[];regions:DistributionBucketDTO<CatalogKey>[];signals:Record<Signal,SignalCountsDTO>;providerCoverage:ProviderCoverageDTO[];statusCounts:Record<Status,Count>}
export interface NetworkObservationListDTO {context:ContextDTO;observations:SummaryDTO[];page:PageDTO}
export interface NetworkObservationDetailDTO {scope:ScopeDTO;generatedAt:UTC;snapshotAt:UTC;current:SnapshotDTO;revisionHistory:{receivedRevisions:Revision[];page:PageDTO};sampling:SamplingDTO}
export interface NetworkObservationRevisionDTO {scope:ScopeDTO;generatedAt:UTC;snapshotAt:UTC;snapshot:SnapshotDTO;sampling:SamplingDTO}
export interface NetworkDiagnosticsDTO {context:ContextDTO;denominatorObservations:Count;statusCounts:Record<Status,Count>;completedStageCounts:Record<Stage,Count>;pendingStageCounts:Record<Stage,Count>;reportedErrors:Array<{stage:Stage;code:ErrorCode;observations:Count;retryableTrue:Count;retryableFalse:Count;retryableUnknown:Count}>;providerCoverage:ProviderCoverageDTO[];evidenceFreshness:{denominatorEvidenceItems:Count;counts:Record<Freshness,Count>};latestReceivedAt:UTC|null}
export interface NetworkReadErrorDTO {code:"RESOURCE_UNAVAILABLE"|"INVALID_REQUEST"|"DATA_UNAVAILABLE"}
export interface NetworkDTOs {overview:NetworkIntelligenceOverviewDTO;list:NetworkObservationListDTO;detail:NetworkObservationDetailDTO;revision:NetworkObservationRevisionDTO;diagnostics:NetworkDiagnosticsDTO}
