# Accufy Chargeback Investigation — Linkage v2 Addendum

Version: 2.0
Status: Shadow Evidence Review
Parent analysis: `chargeback-investigation-v1`
Linkage version: `everflow-commerce-v2`

## Investigation Experience materialization

Sprint 2.2E materializes these approved results through Investigation Runtime V1. The version is immutable, Product/Admin-only, and `completed_with_warnings`. The browser consumes a safe aggregate projection; it does not query raw Commerce, Everflow, dispute, or Evidence records and does not run reconciliation on request.

The runtime preserves Journey analysis, control comparisons, typed and negative findings, attribution provenance, structured Evidence gaps, and the Phase 3 boundary. See `docs/architecture/INVESTIGATION_RUNTIME_V1.md`.

## Executive summary

The v2 evidence-calibrated Journey bridge materially improves historical affiliate coverage without finding a shared Order identifier. It changes affiliate ranking magnitudes and volume order, but it strengthens the original conclusion about Pear/nandi: nandi does not appear uniquely elevated relative to other Pear traffic.

V2 links 960 of 968 nandi acquisition Journeys. Explicit Journey propagation produces 1,244 nandi Orders, of which 103 have defensibly reconciled disputes: 8.28%. Comparable other-Pear Journey Orders have a 9.70% disputed-Order rate. The earlier approximate 16.8% result remains an email-incidence calculation and is not reproduced as an Order rate.

## Findings strengthened

- Nandi is not uniquely elevated within Pear: the comparison now uses canonical Journey Orders rather than contact-only dispute candidates.
- The historical source represents acquisition/event groups, not a guaranteed one-row/one-charge stream.
- Multi-charge Journeys require explicit propagation provenance; they cannot inherit affiliate attribution silently.
- The absence of a shared historical Order identifier is confirmed across all 103 fields and URL/parameter surfaces.

## Findings changed

- Affiliate volume ranking changes from Vertex → Idea Clan → Lagasca to Idea Clan → Vertex → Lagasca.
- Vertex’s bridged dispute rate falls from 23.43% (568/2,424) to 16.92% (965/5,703) as coverage expands.
- Offer Blueprint changes from 33.33% (71/213) to 27.43% (124/452).
- Pear changes from a small v1 bridged subset of 54/635 (8.50%) to 334 disputed Orders across 3,626 Journey Orders (9.21%).
- Nandi changes from no canonical attachment to 103 disputed Orders among 1,244 Journey Orders (8.28%).

## Findings unchanged

- Device, ISP, geography, visitor-IP reuse, and median click-to-purchase remain weak explanations for nandi because their cohort distributions did not depend on Order linkage.
- The Commerce-only correlation between more charges in a ten-minute session and higher disputed-session rate remains observational and unchanged.
- OTO2-platinum remains elevated in the Commerce evidence, but only 213/2,968 Orders have affiliate evidence after v2. Affiliate-controlled OTO2 conclusions remain unsupported.
- No current dispute-arrival spike is established; maturity-aware cohort handling remains required.

## Confidence and evidence gap

V2 provenance is `inferred` for exact-contact/calibrated-time Order links and `propagated_within_journey` for uniquely claimed downstream charges. It is never presented as `direct`. The unresolved 8 nandi groups and all cross-Journey collisions remain excluded. A first-party TKID and checkout handoff is still required for deterministic prospective attribution.
