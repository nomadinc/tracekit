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

## 2026-07-30 — Universal Forensic Analysis Is Pillar #3

### Decision

Universal Forensic Analysis is Pillar #3 of the TraceKit workspace philosophy.

### Context

Users need to move from business conclusions to supporting evidence without leaving the question or context they are investigating.

### Rationale

Making forensic analysis a platform-wide pillar ensures that evidence, diagnostics, relationships, and explanations are consistently available across workspaces.

### Impact

Every workspace must support evidence inspection and explanation without requiring a separate Investigation page.

### Status

Approved.

## 2026-07-30 — Universal Search Accepts Any Identifier

### Decision

Universal Search accepts any supported identifier without requiring the user to select a search type first.

### Context

Users often begin with the evidence they have, such as an email, phone number, order ID, click ID, transaction ID, session ID, payment ID, or journey ID.

### Rationale

TraceKit should identify the likely meaning of evidence instead of making the user understand which internal system owns it.

### Impact

Universal Search must detect likely identifier types and return related objects in understandable business language.

### Status

Approved.

## 2026-07-30 — Search Deep-Links Into the Appropriate Workspace

### Decision

Selecting a Universal Search result deep-links into the appropriate workspace and restores the relevant permanent and temporary context.

### Context

A search result is useful only when it leads directly to the story and evidence the user needs.

### Rationale

Deep-linking preserves the user's thought process and prevents search from becoming another disconnected destination.

### Impact

Search results must select the correct permanent context, focus matching evidence, and open the appropriate inspection experience.

### Status

Approved.

## 2026-07-30 — Customer Is the Permanent Context

### Decision

The customer is the permanent context of the Customer Workspace.

### Context

Orders, events, payments, and attribution records are parts of a customer's story rather than isolated destinations.

### Rationale

Keeping the customer stable allows users to investigate related objects without losing the complete journey.

### Impact

Customer Workspace navigation and information hierarchy must preserve customer context throughout inspection.

### Status

Approved.

## 2026-07-30 — Temporary Inspection Occurs Through Drawers

### Decision

Temporary inspection of related objects occurs through drawers while the workspace's permanent context remains visible.

### Context

Navigating away to inspect an event or order interrupts the user's reasoning and fragments the story.

### Rationale

Drawers provide forensic depth while preserving place, context, and a clear return path.

### Impact

Events, orders, payments, and other temporary contexts should use a shared inspection pattern where practical.

### Status

Approved.

## 2026-07-30 — Internal Architectural Terms Remain Internal

### Decision

Internal architectural terms remain internal and are translated into customer-facing business language.

### Context

Terms describing databases, APIs, queues, import jobs, canonical models, and reconciliation machinery do not answer the user's business question.

### Rationale

The product should absorb implementation complexity while still making evidence, confidence, and limitations transparent.

### Impact

Customer-facing navigation, statuses, explanations, and alerts must use the Translation Layer.

### Status

Approved.

## 2026-07-30 — Estimated and Reconciled Are the UI Financial Badges

### Decision

Estimated and Reconciled badges replace Operational Profit terminology in customer-facing UI.

### Context

The internal distinction between Operational Profit and Reconciled Profit is essential, but Operational Profit is not the clearest customer-facing confidence label.

### Rationale

Estimated and Reconciled communicate the state of a financial value in direct language while preserving the underlying financial distinction.

### Impact

Customer-facing profit displays must use Estimated or Reconciled qualification. Internal calculations and audit records may retain Operational Profit terminology.

### Status

Approved.

## 2026-07-30 — Critical Information Never Relies on Color Alone

### Decision

Critical information must never rely on color alone.

### Context

Color-only status communication is inaccessible and can obscure meaning under different displays, environments, or visual abilities.

### Rationale

Icons, labels, shape, and contrast create redundant signals that preserve meaning.

### Impact

Statuses, alerts, charts, tracking health, and financial confidence indicators must communicate meaning without color dependence.

### Status

Approved.

## 2026-07-30 — Alternate Appearance Palettes Will Be Supported

### Decision

TraceKit will support alternate appearance palettes, including a Color Vision Optimized palette.

### Context

A single color treatment cannot serve every visual need or viewing condition.

### Rationale

Alternate palettes improve accessibility while preserving a coherent information hierarchy and product identity.

### Impact

The design language must allow status, charts, and emphasis to remain legible and consistent across supported palettes.

### Status

Approved.

## 2026-07-30 — Every Important Conclusion Supports Explain

### Decision

Every important conclusion in TraceKit supports Explain.

### Context

Users cannot trust or act on a conclusion if they cannot understand how TraceKit reached it.

### Rationale

Explain connects conclusions to reasoning, evidence, confidence, limitations, and raw values.

### Impact

Important classifications, attribution decisions, financial states, diagnostics, and recommendations must provide an explanation path.

### Status

Approved.

## 2026-07-30 — Replay Journey Remains in the Product Vision

### Decision

Replay Journey remains part of the TraceKit product vision.

### Context

Complex customer journeys can be difficult to understand as a static sequence of records.

### Rationale

Replay helps users observe how a story and its evidence develop over time while retaining the ability to inspect each event.

### Impact

Future Customer Workspace design should preserve a sequential replay interaction without making it a separate navigation destination.

### Status

Approved.

## 2026-07-31 — Offer Is a First-Class Strategic Object

### Decision

- Offer is a first-class TraceKit business Object.
- Storyboard 003 is Offer Workspace, not Campaign Workspace.
- Offer is strategic.
- Campaign is tactical and subordinate to Offer.
- The Business Context selector establishes the active Offer or business context.
- Changing Business Context is not the same as filtering a report.
- Business Context uses a logo, text name, and clear selected state.
- Compare Mode is an approved Offer Workspace capability.
- Compare Mode is part of the Core product direction.
- TraceKit Intelligence may interpret comparisons and recommend actions, but Intelligence remains a separate future add-on.
- MCP Chat remains part of Core and is reactive.

### Context

Storyboard 003 established the Offer Workspace as the strategic decision environment for understanding profitability, performance, Customer quality, Traffic contribution, and investment potential. The governing Object Model, Lexicon, and storyboard library did not yet reflect that approved direction.

### Rationale

TraceKit should reflect how performance marketers and business owners operate: they manage Offers and allocate Traffic through Campaigns, channels, Affiliates, and Creatives.

### Impact

- Offer becomes part of the Object Model and TraceKit Lexicon.
- Campaign remains available as a tactical Object and possible child Workspace.
- The storyboard library uses Storyboard 003 for Offer Workspace.
- Future production architecture and navigation must preserve Offer context.

### Status

Approved.
