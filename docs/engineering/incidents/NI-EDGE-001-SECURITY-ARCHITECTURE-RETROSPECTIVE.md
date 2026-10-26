# NI-EDGE-001 — Security Architecture and Delivery Retrospective

**Status:** OPEN — security correction and independent runtime acceptance outstanding  
**Priority:** P0  
**Recorded:** 2026-10-25  
**Scope:** TraceKit Core, shared Edge ingestion, MCP and Intelligence interfaces  
**Document type:** Incident/engineering-process retrospective; not a security acceptance or implementation authorization

## Executive summary

An independently reported cross-customer authorization defect exists in the Core Edge ingestion path: authentication of a delivery credential was not sufficiently bound to the customer destination selected for persistence. A prior synthetic correction-A probe returned HTTP 201, one mocked ingestion RPC and one usage PATCH for a cross-tenant scenario. This is a reproduced test finding, **not proof of a live production exploit**.

The security program completed valuable, independently accepted source-level corrections (logging/redaction, reflection, P1 ROOT2 verification and inert P2 foundation). It also accumulated complex protected-grant, ROOT2 and PostgreSQL final-guard specifications without producing independently accepted end-to-end runtime closure of the original issue. The original NI-EDGE-001 remains OPEN.

The investigation suffered from an incorrect framing: Edge was repeatedly discussed as though it required per-customer installations or application-login tenant accounts. In fact, TraceKit Edge is a **shared, platform-wide data stream**, with SDKs on many customer websites. MCP and existing Intelligence are also shared platform capabilities. This does not eliminate customer isolation; it clarifies that **service authentication**, **source-to-customer data ownership**, **application-user authorization**, and **operation-specific authority** are separate security decisions.

## Confirmed architectural facts and boundaries

- Shared Edge infrastructure collects and analyzes observations from SDKs deployed on websites belonging to multiple clients.
- MCP operates platform-wide; its callable tools must enforce current customer/workspace and object permissions.
- Application sign-in/workspace tenancy is not the same as Edge SDK collection or server-to-server delivery authentication.
- A valid shared delivery credential, telemetry digest, SDK/site identifier or caller-supplied tenant claim must **not** authorize arbitrary customer selection.
- Core must establish the authorized destination from protected, current source/connection bindings and enforce it before protected persistence; application queries, MCP, caches, exports and dashboards independently enforce customer access.
- Browser SDK identifiers are public and spoofable; they are routing/context signals, not secrets or proof of website origin.
- Dispatch, enforcement, destructive cleanup and native Queue ACK have independent authority gates.

These are the agreed architectural principles. The exact existing source implementation and the minimum safe correction still require source-bound investigation.

## Evidence and work completed

| Area | Recorded outcome | Limitation |
| --- | --- | --- |
| Original cross-tenant probe | HTTP 201 with mocked ingestion and usage calls | Historical synthetic evidence; current deployed behavior not retested |
| Logging / response redaction | Scoped Correction B accepted; 15 regressions passed | Does not close authorization |
| Validation reflection | Candidate `de61f1028af3084342d44423c0e3e0cb7bcbab7c` accepted; 30 focused tests passed | Does not close authorization |
| P1 ROOT2 source | Candidate `96e3ea71f7dbe773cf20434b1aa883aa1ee292d0` independently accepted; 314 offline tests reported | Source-level only |
| P2 inert foundation | Candidate `918aeb11c09ce1f8654539a1da29bdfc40ea411b` accepted for source security | Fail-closed foundation, not positive ingestion authority |
| Immutable authorization context | Normative SHA-256 `35062379706e32198bb7e9b5754add45f1a11a07e9f20752440fd058ad7ca354` accepted | No native implementation acceptance |
| Current ROOT2 trust | Proposed normative SHA-256 `737873a093d12db78175ba2e1975d84d9a62666fa518d8cabdb802a9861451dd` | Ratification and implementation not established |
| Core-only Release 1.0 | Edge exclusion proposed | Reachable Edge routes, legacy RPC/direct-write paths and credentials not proven disabled |

Do not infer operational acceptance, a resolved vulnerability, or a safe release from contract hashes, offline test totals or source-only reviews.

## Process failure and impact

1. **Architecture was not established before solution design.** A shared data stream was conflated with per-customer Edge accounts and application-login tenancy.
2. **Scope expanded before proving the minimal fix.** Repeated grant, ROOT2, registry, guard, privilege and review cycles were pursued without first settling whether existing Core source/connection authorization could close the exact write path.
3. **Progress reporting blurred acceptance levels.** Specification PASS, source-security PASS, synthetic PASS and native/runtime PASS were sometimes discussed as though equivalent.
4. **The original P0 lost priority.** Release 1.1 telemetry and evidence-transfer work advanced while NI-EDGE-001 remained unresolved.
5. **Artifact accessibility added avoidable cycles.** Review packages were repeatedly inaccessible across workstreams, requiring recovery and checksum transfer.

**Impact:** Significant engineering/review time and launch delay; increased complexity and uncertainty. The precise time/cost is not established. No customer compromise or production exploit is asserted without evidence.

## Immediate corrective program

**Isolation:** New security investigation, correction and independent validation workstreams must not modify existing workstream branches or reserved files. Proposed identifiers WS-027/028/029 must be checked against the authoritative registry before assignment. Prior accepted work remains evidence, not an automatic design mandate.

### Gate A — Source-bound investigation
- Pin exact Core/Edge revisions and deployed candidate provenance.
- Trace SDK/site evidence → shared Edge → authenticated delivery → Core route → resolver/authority check → RPC/direct write → persisted customer identity.
- Reproduce the unauthorized cross-customer case against the exact vulnerable baseline.
- Compare existing Core/MCP authorization patterns and identify the minimum reusable protected source/customer binding.
- Inventory bypass routes, legacy RPCs, direct writes, wrappers, credentials, Workers, Queues and cron.
- Decide explicitly whether ROOT2/protected grants are required for this particular write path; do not assume either answer.

### Gate B — Minimal correction
- Propose exact changed-file and database privilege scope, including independent ownership reservations.
- Enforce current protected source/customer binding, revocation/reassignment checks, post-wait validation and zero unauthorized writes.
- Preserve shared multi-client ingestion and prevent cross-customer substitution.
- Keep historical and accepted security artifacts unchanged; do not silently weaken controls.

### Gate C — Independent verification
- Reproduce original failure on baseline and denial on candidate.
- Verify legitimate multi-customer operation, stale/revoked bindings, concurrent reassignment, legacy bypass denial and zero-write rollback using actual-role/native tests where required.
- Verify MCP and Core Intelligence data isolation independently.
- Require independent source, native and staging acceptance before claiming NI-EDGE-001 closed.

## Release boundaries

**Release 1.0:** Core + MCP + existing Core Intelligence. Edge may be deferred **only if** every vulnerable Edge ingress, RPC, direct-write and background path is independently shown fail-closed, without disabling legitimate commerce integrations. MCP authorization, financial redaction, staging isolation and data correctness are separate launch gates.

**Release 1.1:** Shared Edge + Network Intelligence, with independently controlled telemetry/reporting/enforcement/cleanup/ACK capabilities. No operational activation follows from design or synthetic acceptance.

## Decision and prevention rules

- Start with **source evidence → reproducible failure → minimal correction → independent acceptance**.
- Record exact commit, affected methods, expected/actual behavior, changed files, tests and residual risk for each security finding.
- Require an explicit shared-platform architecture review before introducing new tenant/account models.
- Never equate service authentication with authorization to select customer data.
- Never equate contract/source acceptance with native runtime acceptance.
- Require accessible immutable evidence and recipient checksum acknowledgment for cross-workstream reviews.
- Keep launch-critical P0 defects visible in the Master registry until closed or independently proven excluded from launch.
- Stop when source, authority or ownership prerequisites are missing; do not invent security semantics.

## Open decisions

1. Exact source revisions and deployed ingress topology for the current vulnerability.
2. Whether a protected source/site-to-customer registry already exists and is sufficient.
3. Minimum approved implementation/privilege scope, and which accepted P1/P2 controls are actually needed.
4. Independent runtime denial and zero-write evidence.
5. Core-only launch exclusion verdict and release authorization.

**Final status:** NI-EDGE-001 OPEN. Release 1.0 and Release 1.1 remain HOLD pending their respective acceptance gates. This document does not authorize SQL, credentials, merges, deployments or operational activation.
