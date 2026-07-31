# TraceKit Workspace Design System

Version: 1.0
Status: Living Document

## 1. Purpose

The TraceKit Workspace Design System is the UI constitution for TraceKit.

It defines the shared product language, information model, and interaction principles used by every workspace. It ensures that different parts of TraceKit feel like connected chapters of one business rather than separate tools.

This document describes how TraceKit should communicate and behave. It does not define implementation architecture, visual specifications, or technical components.

The [TraceKit Product Blueprint](TRACEKIT_PRODUCT_BLUEPRINT.md) remains the authority for product intent. The Workspace Design System translates that intent into durable rules for the product experience.

## 2. Workspace Philosophy

TraceKit is a collection of connected workspaces.

Each workspace begins with an important business question and helps the user follow the evidence to an answer. A workspace is not a container for records from one system. It is a coherent environment for understanding a person, outcome, decision, or area of responsibility.

Navigation follows thought, not technology.

Workspace boundaries should reflect how people reason about the business. They should never require users to understand databases, APIs, queues, connectors, import jobs, canonical models, or reconciliation machinery.

Every workspace:

- Has one permanent context.
- Tells a story.
- Connects related objects.
- Supports temporary inspection without losing place.
- Preserves a path from conclusions to evidence.
- Makes uncertainty visible.
- Provides a meaningful next step.

## 3. Workspace Anatomy

Every TraceKit workspace uses the same conceptual anatomy.

### Permanent Context

Permanent Context is the stable subject of the workspace.

It answers: “Whose or what story am I exploring?”

The permanent context remains in place while the user investigates related objects. In the Customer Workspace, the customer is permanent. An order, payment, journey event, or financial record may be inspected, but it does not replace the customer.

The permanent context should always be clear through the workspace title, identity, key state, and primary summary.

### Story

Story is the ordered explanation of what happened, why it matters, and how the current state came to be.

A story may unfold through time, relationships, financial changes, attribution decisions, operational events, or a combination of these. It should make cause, sequence, consequence, and uncertainty understandable.

Every workspace should help the user answer:

- What is this?
- What happened?
- What changed?
- Why does it matter?
- What needs attention?
- What should happen next?

### Related Objects

Related Objects are the people, journeys, orders, payments, campaigns, conversions, financial events, costs, work items, and other evidence connected to the permanent context.

Relationships must be explicit and navigable. No important object should appear without enough context to explain how it belongs to the story.

Every related object must have a home and a meaningful next step.

### Temporary Context

Temporary Context is the object currently under inspection.

It allows a user to examine an event, order, payment, attribution decision, financial record, or other related object without replacing the permanent context.

Temporary context should be presented through a drawer or another clearly subordinate inspection surface. Closing it returns the user to the same place in the workspace.

### Evidence

Evidence is the observable information supporting a status, relationship, classification, calculation, or conclusion.

Evidence may include:

- Source records
- Timestamps
- URLs and referrers
- Identifiers
- Redirect paths
- Parameters
- Financial events
- Relationships
- Matching signals
- Diagnostics
- Confidence and limitations

Evidence must remain available at the depth appropriate to the user's need. Summaries may simplify it, but raw values must never be hidden.

### Explain

Explain connects a conclusion to its reasoning.

Every important conclusion supports Explain. An explanation should state:

- What TraceKit concluded
- Why TraceKit reached the conclusion
- What evidence supports it
- How confident TraceKit is
- What evidence is missing or conflicting
- What the user can inspect or do next

Explain must distinguish observation from inference and confidence from certainty.

## 4. Universal Search

Universal Search is evidence search.

The user may enter any supported identifier without selecting a search type first. TraceKit detects its likely meaning, finds related objects, and presents results in business language.

Supported evidence may include:

- Email
- Phone number
- Customer ID
- Order ID
- Session ID
- Journey ID
- Click ID
- Affiliate transaction ID
- Payment ID
- Financial event ID

Selecting a result should deep-link into the appropriate workspace. TraceKit restores the correct permanent context, focuses the matching evidence, highlights the relevant object or event, and opens temporary inspection when needed.

Universal Search is not a separate destination. It is a platform-wide way to enter the correct story from any known piece of evidence.

## 5. Drawers

Drawers provide temporary inspection while preserving permanent context.

A drawer should:

- Name the object being inspected.
- Preserve a visible relationship to the permanent context.
- Present a clear summary before forensic depth.
- Organize evidence into understandable groups.
- Expose raw values.
- Show relationships and next steps.
- Support Explain.
- Close without losing the user's place.

The same inspection language should be used across related object types wherever practical. A user should not need to learn a different forensic interaction for events, orders, payments, or financial records.

Drawers are not miniature disconnected pages. They are subordinate chapters inside the current workspace story.

## 6. Progressive Disclosure

TraceKit should be understandable at first glance and defensible under inspection.

The default workspace presents:

- Permanent context
- Current state
- Most important conclusions
- Material changes
- Required actions
- Confidence or limitation where relevant

Additional depth appears when requested through:

- Hover or focus previews
- Drawers
- Expandable sections
- Relationships
- Diagnostics
- Raw values
- Explain
- Replay

Progressive disclosure does not conceal complexity. It gives complexity an appropriate place.

Business owners should receive a calm, direct story. Specialists should be able to reach complete evidence without leaving the workspace or losing context.

## 7. Translation Layer

The Translation Layer converts internal complexity into language that supports a business decision.

Customers should not need to understand:

- Databases
- APIs
- Queues
- Import jobs
- Connector architecture
- Canonical models
- Reconciliation logic
- Internal financial-state names

TraceKit should communicate:

- What is known
- What happened
- What it means
- How confident TraceKit is
- What is missing or conflicting
- What needs attention
- What the user can do next

The Translation Layer must simplify language without simplifying away truth. Evidence, provenance, uncertainty, and raw data remain available.

## 8. Status Badges

Status badges communicate a meaningful state in concise language.

A badge must combine a clear label with shape, contrast, and an icon where the state is critical. Color may reinforce meaning but must not carry meaning alone.

Badges should describe customer-relevant states rather than internal process names. They must be specific enough to guide interpretation or action.

### Estimated

Estimated indicates that a financial value uses the best qualified information currently available but is not fully reconciled.

Estimated does not mean invented, untraceable, or silently approximated. The value must remain explainable and supported by observed evidence. Known limitations, missing authoritative events, and confidence should be visible through Explain.

### Reconciled

Reconciled indicates that a financial value has completed the required reconciliation against authoritative evidence.

The badge communicates a higher state of financial finality and audit confidence. Users must be able to inspect the evidence and adjustments supporting that state.

Estimated and Reconciled replace Operational Profit terminology in customer-facing UI. The distinction between operational and reconciled financial states remains permanent in TraceKit's financial model.

## 9. Accessibility

Accessibility is part of the product definition.

Critical information must never rely on color alone.

TraceKit uses redundant communication:

- Icons
- Labels
- Shape
- Position
- Pattern where appropriate
- High contrast

Status, severity, confidence, and selection must remain understandable without color.

TraceKit will support alternate appearance palettes, including a Color Vision Optimized appearance palette. Alternate palettes must preserve hierarchy, emphasis, status meaning, and brand coherence.

Charts must not rely solely on color. Series, categories, and states should also use direct labels, shapes, patterns, line styles, or other distinguishable signals.

Every workspace should support keyboard navigation, visible focus, understandable reading order, clear control names, and equivalent access to evidence, relationships, Explain, and actions.

## 10. Universal Forensic Analysis

Universal Forensic Analysis is Pillar #3 of the TraceKit workspace philosophy.

It allows any important business conclusion to be followed back through the story and into its supporting evidence. It is available throughout TraceKit rather than as a separate Investigation page.

### Evidence

Evidence shows the observed facts, source values, timestamps, identifiers, and provenance supporting the current interpretation.

### Relationships

Relationships show how the inspected object connects to its customer, journey, order, payment, affiliate conversion, financial event, profit calculation, or other relevant context.

Relationships prevent evidence from becoming isolated and ensure that every object leads somewhere meaningful.

### Diagnostics

Diagnostics describe observable health, gaps, conflicts, and limitations.

Diagnostics must distinguish facts from likely explanations. TraceKit may say that tracking interference is likely or that a browser privacy restriction may have affected tracking. It must not claim knowledge it does not possess.

### Explain

Explain translates evidence and diagnostics into clear reasoning. It must show why TraceKit made a classification or attribution decision and identify uncertainty when the evidence is incomplete.

### Replay Journey

Replay Journey presents the story in sequence.

It allows a user to start, pause, advance, select the active event, and inspect the evidence available at that moment. Replay makes the accumulation and loss of context visible without becoming a separate destination.

Replay Journey remains part of the product vision.

## 11. Design Rules

The following rules govern every TraceKit workspace:

1. Navigation follows thought, not technology.
2. Every workspace has one permanent context.
3. Every workspace tells a story.
4. Every object tells a story.
5. Every piece of evidence has a home.
6. Every important conclusion supports Explain.
7. Nothing is a dead end.
8. Users search evidence, not systems.
9. Temporary inspection must preserve permanent context.
10. Raw data is never hidden.
11. Observation, inference, confidence, and certainty must remain distinct.
12. Financial state must always be qualified.
13. Critical information must never rely on color alone.
14. Progressive disclosure should protect clarity without limiting depth.
15. Complexity belongs in implementation.
16. Simplicity belongs in the experience.

> Every important business question should be answerable by following the evidence.
