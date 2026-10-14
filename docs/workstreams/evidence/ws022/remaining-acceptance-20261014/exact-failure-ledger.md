# WS-022 exact remaining failure / gate ledger

Candidate88f7411457b988e83e51fbc9bf7b4b5b76002fe7. A BLOCKED or OPEN gate is not a passed acceptance case. Historical original regression ledgers remain preserved in the recovered candidate and inherited evidence.

| ID | Exact item | Disposition | Owner / remaining action |
|---|---|---|---|
| R1 | Detail currencies read from wrong response level | CLOSED, existing fix; fresh independent actual-route/render/null/race checks pass | None in reviewed code scope |
| AUTH-1 | Email member login, persistence, logout/session clearing/re-login | BLOCKED at existing-password challenge | Staging identity custodian supplies existing member session in browser |
| TEN-1 | Admin selected organization/workspace access | BLOCKED | Existing Admin identity and intended scope needed |
| TEN-2 | Client selected organization/workspace access | BLOCKED | Existing client identity and intended scope needed |
| TEN-3 | Admin/client separation | BLOCKED | Both role sessions needed; synthetic checks do not close staging |
| TEN-4 | Direct cross-tenant denial | BLOCKED | Allowed/denied tenant targets and member sessions needed |
| GOV-1 | Governed-action permissions in staging | BLOCKED; independent synthetic permissions pass | WS-022 executor after member access |
| CB-1 | Authenticated chargeback UI currency/detail races | BLOCKED live UI; actual API-to-render synthetic pass | WS-022 executor after member access |
| META-1 | Inactive Meta permission separation in staging | BLOCKED live UI; independent route/service checks pass | WS-022 executor after member access; no activation |
| LOGOUT-1 | Logout lands on production signed-out page | CONFIG DEFECT CLOSED; exact preview root added only in WorkOS Staging, corrected destination observed | Full member lifecycle remains AUTH-1 |
| DB-1 | real SDK-compatible journey_started follows the Worker claim/persistence pipeline against the actual schema | CLOSED, fresh actual-schema pass | Focused + full API; see database report |
| DB-2 | evidence-only interruption resumes the same event without another reservation | CLOSED, fresh actual-schema pass | Focused + full API |
| DB-3 | Stage-1 event types share the same explicit persistence mapper | CLOSED, fresh actual-schema pass | Focused + full API |
| DB-4 | an event without its matching evidence fails closed | CLOSED, fresh actual-schema pass | Focused + full API |
| DB-HARNESS | Authoritative chain + required platform/M15 prerequisites | PASS through20261014034517 | Own fixture cleanup evidence in database/ |
| TOOL-1 | Five high UI package records, one braces advisory | OPEN / UNWAIVED | Security + tooling owners: supported patch/replacement or explicit bounded risk decision |
| TOOL-2 | ESLint10 peer declarations conflict with stable React/import/accessibility plugins | OPEN / UNWAIVED | UI tooling owner: supported compatible stack or explicit bounded decision |
| LINT-1 | Nine existing lint warnings | RECORDED, zero errors; unchanged | UI maintainer backlog; no suppression used |
| REVIEW-1 | Separate review and visible PR record | COMPLETE,51 independent passes; COMMENT review5524567480 | Not live independent staging certification |
| EVIDENCE-1 | Durable reviewer-accessible evidence | PUBLISHED on separate evidence branch, links in PR | Immutable commit/package link in final report |
| WS024-1 | Preserve earlier migration provenance | COMPLETE; inherited archives separate | Not relabeled as fresh candidate results |
| FIN-1 | Affiliate/source monetary reporting | HELD pending WS-001 financial certification | WS-001 owner; no financial writes |
| META-ACT | Meta activation/certification | INACTIVE / UNCERTIFIED by design | Meta owner; separate certification/authorization |
| RELEASE-1 | Production V1 | HOLD, not authorized | Release owner; no merge or production deployment |

Environment/invocation failures are in database attempt logs/report and independent review notes (early database raw attempts1–4 were overwritten and have narrative diagnostics only): local connection readiness, missing official Storage prerequisites, direct PostgREST URL-prefix setup, and initial independent invocation omitting React server condition. They were corrected without changing application assertions; final successful counts are distinct and preserved. A transient missing local output directory delayed TypeScript/lint invocation; no test was run in that invocation, and subsequent fresh commands exited0.
