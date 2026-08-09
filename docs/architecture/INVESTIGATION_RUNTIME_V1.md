# TraceKit Investigation Runtime V1

Version: 1.0
Status: Implementation Foundation

## Product contract

An Investigation is a reproducible, evidence-backed analysis of an outcome and the Journey that produced it. It includes an appropriate control where one exists and distinguishes observation, correlation, negative finding, and hypothesis. It does not automate causal conclusions or dispute operations.

Negative findings and uncertainty are first-class results. Ambiguous reconciliation, propagated attribution, immature cohorts, missing Evidence, and sample limitations remain visible.

## Runtime boundary

The browser may request a run and read its safe status. It does not execute reconciliation or reconstruct analytics. A durable worker claims a queued `tracekit_investigation_runs` row through an atomic lease, heartbeats it, writes an immutable `tracekit_investigation_versions` projection, and completes the run. Expired leases are recoverable; active leases cannot be stolen; cancelled and terminal runs cannot restart.

Run identity binds Organization, Investigation, source snapshot, Evidence cutoff, and all analysis/reconciliation versions. An identical identity is idempotent. A methodological change creates a new run and version; historical results are never overwritten.

## Authorization

V1 is restricted to persistent Product/Admin sessions with `admin.manage_feature_access`. The server derives the active Organization and rejects impersonated, development, missing-membership, and cross-Organization requests. Service-role access does not replace application authorization.

Investigation tables have RLS enabled and grant no browser-role access. Evidence payloads remain protected. The presentation contains aggregates, rule versions, coverage, and safe provenance only—never contact data, IP addresses, raw payloads, storage references, secrets, or ciphertext.

## Journey and attribution

Every Investigation includes a Journey section. The approved Everflow V2 model treats an Everflow Transaction as an acquisition/event Journey. `direct` and `propagated_within_journey` remain distinguishable. Propagation requires the same Organization, Connection, and Person, a unique Journey claim, and the approved ten-minute window. Conflicting claims remain excluded and reviewable.

## Read-model contract

The page reads an immutable presentation version containing the executive finding, structured warnings, source-specific Evidence quality, outcome and maturity context, concentration, cohort/control comparisons, observed/propagated/missing Journey steps, typed findings, weakened and current hypotheses, Evidence gaps, deterministic next questions, and safe methodology/provenance.

Previously successful versions remain available if a later run fails. Request-time pages never run full reconciliation or scan provider records.

## Accufy reference

The first materialized version preserves the approved Sprint 2.2D results as `accufy-investigation-v2` with status `completed_with_warnings`. It preserves the 8.28% Nandi incidence, 9.70% other-Pear control, 24.73% OTO2 Commerce observation, multi-charge correlation, attribution coverage, and historical limitations without introducing a causal claim.

## Phase boundary

V1 does not implement TKID instrumentation, RDR, Ethoca, representment, automated refunds, dispute submission, evidence-package submission, or fight/accept decisioning.
