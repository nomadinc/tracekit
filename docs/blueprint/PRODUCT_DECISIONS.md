# TraceKit Product Decision Log

This file records important product decisions and why they were made. It provides durable context for product, design, and engineering work and should be updated when a decision is approved, superseded, or deferred.

## Decision Entry Template

## YYYY-MM-DD — Decision Title

### Decision

What was decided.

### Context

Why the decision was needed.

### Rationale

Why this option was chosen.

### Impact

Affected product areas, architecture, UI, connectors, or workflows.

### Status

Proposed, Approved, Superseded, or Deferred.

---

## 2026-07-30 — Profit Is the Primary Metric

### Decision

Profit is TraceKit's primary metric.

### Context

Clicks, conversions, and revenue do not independently show whether a business is making money.

### Rationale

Leading with profit aligns the product with the operating decisions its customers need to make.

### Impact

Dashboards, reporting, alerts, product language, and prioritization must lead with qualified profit metrics.

### Status

Approved.

## 2026-07-30 — Operational Profit and Reconciled Profit Are Separate

### Decision

Operational Profit and Reconciled Profit are separate financial states and must remain clearly distinguished.

### Context

During-day operational data and fully reconciled financial data differ in timing, completeness, and authority.

### Rationale

Separating the states lets users act on current information without representing provisional values as final.

### Impact

Profit calculations, labels, dashboards, data freshness indicators, reconciliation workflows, and documentation must preserve the distinction.

### Status

Approved.

## 2026-07-30 — First-Touch Attribution Is Permanently Preserved

### Decision

The first touch that introduced a customer to the business must be permanently preserved.

### Context

Later visits and conversions can overwrite or obscure the original source in systems that retain only the latest attribution.

### Rationale

Permanent first-touch attribution protects the origin story of the customer relationship while subsequent touchpoints preserve the complete journey.

### Impact

Identity, attribution, event storage, imports, customer journeys, and reporting must not overwrite first-touch provenance.

### Status

Approved.

## 2026-07-30 — Snapshot Mode Is the Customer-Facing Term

### Decision

Snapshot Mode is the approved customer-facing term; diagnostic-only is not customer-facing language.

### Context

Internal diagnostic terminology does not clearly describe the experience or limitations to customers.

### Rationale

Snapshot Mode is concise and communicates a bounded view without exposing implementation language.

### Impact

Customer-facing UI, onboarding, help content, alerts, and product documentation must use Snapshot Mode.

### Status

Approved.

## 2026-07-30 — Connector Onboarding Has Four Completion Gates

### Decision

Connector onboarding ends only when all four lifecycle states are complete:

- Connected
- Initial Import Complete
- Automatic Sync Enabled
- Dashboard Ready

### Context

A valid credential or successful connection does not guarantee that data is imported, kept current, or usable in the dashboard.

### Rationale

The four gates define completion in terms of customer value and ongoing reliability.

### Impact

Connector onboarding, status models, UI, operational alerts, and acceptance criteria must represent the full lifecycle.

### Status

Approved.

## 2026-07-30 — WowBoost Follow-Up Is Deferred

### Decision

WowBoost-specific follow-up is deferred behind Shopify, Commas, and Next29.

### Context

WowBoost has source-specific edge cases but is not widely used enough to remain launch-critical.

### Rationale

Launch effort should prioritize connectors with greater immediate customer and commercial relevance while preserving existing WowBoost compatibility.

### Impact

Connector planning and launch sequencing prioritize Shopify, Commas, and Next29. WowBoost investigation remains deferred.

### Status

Approved.

## 2026-07-30 — Initial Commercial Goal Is 25 Paying Customers

### Decision

The initial commercial goal is 25 paying customers within six months of launch.

### Context

TraceKit needs a concrete early validation target tied to real operational reliance.

### Rationale

Paying customers who trust TraceKit for operational decisions demonstrate stronger product validation than registrations or trials.

### Impact

Launch planning, onboarding, customer success, and product measurement should evaluate progress against this goal.

### Status

Approved.

## 2026-07-30 — Product Blueprint Governs Product Intent

### Decision

The [TraceKit Product Blueprint](TRACEKIT_PRODUCT_BLUEPRINT.md) is the source of truth for product intent.

### Context

Product intent and implementation architecture need clear, complementary authorities.

### Rationale

A single product authority prevents implementation details or isolated documents from unintentionally redefining the product.

### Impact

Product, design, architecture, and implementation work must surface conflicts with approved Blueprint decisions before proceeding.

### Status

Approved.

## 2026-07-30 — Financial Accuracy Precedes Dashboard Completeness

### Decision

Financial accuracy takes precedence over dashboard completeness.

### Context

Missing or delayed financial data can create pressure to fill dashboard gaps with estimates or misleading certainty.

### Rationale

Clearly showing a limitation protects trust and supports informed action better than presenting an unsupported number.

### Impact

Dashboards, calculations, partial-data states, alerts, and connector behavior must disclose financial limitations rather than conceal or silently estimate them.

### Status

Approved.
