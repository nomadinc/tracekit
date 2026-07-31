# TraceKit Product Blueprint

Version: 1.2
Status: Living Document

## Purpose

The TraceKit Product Blueprint is the authoritative product vision for TraceKit.

It defines what TraceKit is becoming, why it exists, who it serves, how users should experience it, and how future product decisions should be evaluated.

Architecture documents define how the system works.

The Product Blueprint defines what we are building and why.

If implementation conflicts with an approved Product Blueprint decision, the conflict must be surfaced and resolved before further implementation.

## Version History

### 1.2

- Chapter 4 completed

### 1.1

- Chapter 2 completed
- Chapter 3 completed

### 1.0

- Initial Product Blueprint
- TraceKit Manifesto
- Product vision
- Mission
- Promise
- Guiding principles
- North Star
- Product success definition
- Initial product decisions

## Table of Contents

1. Chapter 1 — The TraceKit Manifesto
2. Chapter 2 — The Questions We Help People Answer
3. Chapter 3 — The TraceKit Experience
4. Chapter 4 — How TraceKit Understands a Business
5. Chapter 5 — Navigation
6. Chapter 6 — Storyboards
7. Chapter 7 — Profit Engine
8. Chapter 8 — Connector Framework
9. Chapter 9 — Design Language
10. Chapter 10 — Product Roadmap

# Chapter 1 — The TraceKit Manifesto

## Vision

TraceKit exists to become the operating system for profit-driven businesses.

Its central experience is a trusted dashboard that shows the actual profit an online advertiser is making and can be checked at any point during the day.

TraceKit is also the permanent customer-journey hub. There should never be uncertainty about the first traffic source, campaign, affiliate, or touchpoint that introduced a customer to the business.

At any moment, a business owner should be able to answer:

- How much profit am I making right now?
- Where did that profit come from?
- Why did it change?
- What needs my attention next?

## Mission

To eliminate uncertainty in performance marketing by creating a single source of truth for commerce, attribution, financial events, costs, customer journeys, and operational intelligence.

TraceKit continuously collects data from critical business systems, preserves the complete customer journey, calculates Operational Profit, supports Reconciled Profit, and explains the financial story behind every dollar.

## Promise

Every number shown in TraceKit must be:

- Accurate
- Explainable
- Auditable
- Actionable

If a number cannot be trusted, TraceKit will clearly communicate why instead of pretending certainty.

## North Star

> Every dollar tells a story. TraceKit's job is to preserve that story—from the customer's first click to the final reconciled profit.

## The Story of a Dollar

The story begins with the customer's first click. TraceKit records its traffic source, campaign, affiliate, and each returning visit. When the customer converts, the same journey expands to include the products, revenue, discounts, payment, processor fees, affiliate commission, and transaction context associated with the conversion.

The story continues after the sale. Refunds, chargebacks, shipping costs, advertising costs, and other financial events remain connected to the original customer and journey. Reconciliation resolves those events against authoritative records and produces final Reconciled Profit.

The customer never disappears from this lifecycle. Every event remains attached to the same journey, from first click through final Reconciled Profit, so the origin, evolution, and financial outcome of every dollar remain explainable.

## The Three Pillars

### Profit

Profit is the primary metric, not clicks, conversions, or revenue alone.

### Attribution

TraceKit preserves first-touch attribution and the complete sequence of subsequent touchpoints.

### Operational Intelligence

TraceKit identifies stale data, failed connectors, financial discrepancies, reconciliation work, and other issues requiring action.

## What Makes TraceKit Different

Most platforms answer:

“What happened?”

TraceKit must answer:

- What happened?
- Why did it happen?
- How profitable was it?
- What should I do next?

## Product Philosophy

1. Profit comes before revenue.
2. Every dollar must be explainable.
3. Every customer journey must be preserved.
4. Financial accuracy outweighs dashboard completeness.
5. Automation beats repetitive manual work.
6. Connect once. Sync continuously.
7. One source of truth is better than conflicting reports.
8. Trust is earned through transparency.
9. Users should never have to guess what needs attention.
10. Product decisions should strengthen the story behind every dollar.

## Success Definition

> TraceKit succeeds when a business owner can open one dashboard, at any moment during the day, and confidently understand current profit, the complete customer journey behind it, and exactly what action to take next.

The initial commercial validation goal is:

- 25 paying customers within six months of launch

These must be paying businesses using TraceKit because they trust it to make operational decisions, not accounts that merely registered or evaluated the product.

## Chapter 1 Status

Complete.

### Decisions Made

- TraceKit is the operating system for profit-driven businesses.
- Profit is the primary metric.
- Operational Profit and Reconciled Profit are separate states.
- First-touch attribution must be permanently preserved.
- Every number must be explainable and auditable.
- Financial limitations must be shown rather than hidden.
- The Executive Dashboard is the primary operational workspace.
- The initial six-month goal is 25 paying customers.

### Open Questions

Open questions will be developed and resolved in the relevant later chapters.

### Future Considerations

The following capabilities may be explored in later chapters but are not designed or committed in version 1.0:

- AI recommendations
- Forecasting
- Multi-currency
- Enterprise administration
- Automated month-end close

# Chapter 2 — The Questions We Help People Answer

TraceKit serves people with different responsibilities, but each of them comes to the product to replace uncertainty with an answer they can trust and act on.

Every screen in TraceKit must have a clearly defined primary persona.

## Founder / CEO

### Who They Are

The Founder or CEO is accountable for the health, direction, and durability of the business. They need a complete view without having to reconcile reports from multiple teams and systems.

### The Question They Need Answered

How much profit is the business making right now, why has it changed, and what needs my attention?

### Why That Question Matters

The answer determines whether the business can scale confidently, must correct a problem, or needs to protect cash and margin.

### What They Care About

- Current Operational Profit
- Reconciled Profit
- Revenue, costs, and margin
- Trends and material changes
- Risks, exceptions, and required decisions
- Confidence in the numbers

### Daily Workflow

They begin with the Executive Dashboard, review current profit and material changes, inspect issues that require leadership attention, and drill into the underlying channel, customer, or financial story only when needed.

### Home Screen

Executive Dashboard.

### Success Moment

They understand the state of the business in minutes and can make a decision without asking several teams to reconcile conflicting reports.

## Marketing Director / VP of Marketing

### Who They Are

The Marketing Director or VP of Marketing owns growth performance across channels, campaigns, partners, and teams.

### The Question They Need Answered

Which marketing investments are producing profitable growth, and where should budget or attention move next?

### Why That Question Matters

Revenue growth can conceal weak margins, rising acquisition costs, or channels that appear successful under incomplete attribution.

### What They Care About

- Profit by channel and campaign
- Spend efficiency
- First-touch and subsequent-touch attribution
- Customer acquisition trends
- Budget allocation
- Data freshness and connector health

### Daily Workflow

They review portfolio-level performance, compare channels and campaigns, investigate significant changes, coordinate action with media buyers and affiliate managers, and verify that the data is current enough to support budget decisions.

### Home Screen

Marketing performance workspace with profit, attribution, and exceptions summarized across channels.

### Success Moment

They can explain where profitable growth is coming from and reallocate spend with confidence.

## Media Buyer

### Who They Are

The Media Buyer manages advertising spend and campaign performance throughout the day.

### The Question They Need Answered

Which campaigns, ads, and traffic sources are profitable now, and what should I scale, hold, or stop?

### Why That Question Matters

Delayed or incomplete feedback can cause profitable opportunities to be missed and unprofitable spend to continue.

### What They Care About

- Operational Profit by campaign and traffic source
- Advertising cost
- Revenue and conversion performance
- Attribution confidence
- Intraday changes
- Stale or missing data

### Daily Workflow

They check performance at the start of the day, monitor material changes as spend accumulates, drill into campaigns that cross attention thresholds, and make budget decisions using qualified current data.

### Home Screen

Campaign performance workspace ordered by profit and required action.

### Success Moment

They know exactly what to scale, hold, or stop and can see the evidence behind the recommendation.

## Affiliate Manager

### Who They Are

The Affiliate Manager recruits, supports, and evaluates affiliates while protecting the economics and integrity of the program.

### The Question They Need Answered

Which affiliates are introducing valuable customers and generating profitable, trustworthy business?

### Why That Question Matters

Sales volume alone does not account for commission, customer quality, refunds, chargebacks, attribution disputes, or downstream profitability.

### What They Care About

- Permanently preserved first-touch affiliate attribution
- Profit and revenue by affiliate
- Commission
- Refund and chargeback behavior
- Customer quality
- Attribution disputes and anomalies

### Daily Workflow

They review affiliate performance and exceptions, investigate unusual changes or disputed journeys, support partners with traceable evidence, and identify relationships to expand, correct, or pause.

### Home Screen

Affiliate performance workspace with profit, customer quality, and attribution integrity.

### Success Moment

They can reward valuable partners and resolve a dispute using the complete, preserved customer journey.

## Finance

### Who They Are

Finance is responsible for the accuracy, explainability, and reconciliation of the business's financial results.

### The Question They Need Answered

Can every material dollar be traced, qualified, and reconciled to an authoritative financial event?

### Why That Question Matters

Operational decisions, cash planning, and period close depend on knowing which values are current estimates, which are authoritative, and which require reconciliation.

### What They Care About

- Clear separation of Operational Profit and Reconciled Profit
- Processor fees and financial events
- Refunds, chargebacks, commissions, shipping, and other costs
- Source provenance
- Reconciliation status and discrepancies
- Auditability

### Daily Workflow

They review unresolved financial exceptions, inspect source records and mappings, reconcile qualified events, monitor the movement from Operational Profit to Reconciled Profit, and prepare for period close.

### Home Screen

Financial reconciliation workspace with discrepancies, confidence states, and outstanding work.

### Success Moment

They can close a period with every material variance explained and supported by source provenance.

## Operations

### Who They Are

Operations keeps the business's connected systems, data flows, and recurring workflows functioning reliably.

### The Question They Need Answered

What is stale, failed, incomplete, or blocking the business from operating on trusted information?

### Why That Question Matters

Connector failures and incomplete data can quietly undermine decisions across marketing, finance, support, and leadership.

### What They Care About

- Connector lifecycle and sync health
- Import completeness
- Data freshness
- Failed jobs and operational exceptions
- Clear ownership and recovery actions
- Dashboard readiness

### Daily Workflow

They begin with issues requiring attention, investigate stale or failed data flows, coordinate recovery, confirm that automated sync resumes, and verify that affected dashboards return to a trustworthy state.

### Home Screen

Operational intelligence workspace prioritized by severity, business impact, and next action.

### Success Moment

They identify and resolve a data problem before it causes a bad business decision.

## Customer Support

### Who They Are

Customer Support helps customers understand orders, payments, refunds, and the history of their relationship with the business.

### The Question They Need Answered

What happened to this customer, order, payment, or refund, and what should I tell them next?

### Why That Question Matters

Fast, accurate answers protect customer trust and reduce escalations across support, finance, and operations.

### What They Care About

- Complete customer journey
- Orders and products
- Payments and transaction IDs
- Refunds and chargebacks
- Source timestamps and status changes
- Clear current state

### Daily Workflow

They search for a customer or transaction, review the chronological journey and related financial events, answer the immediate question, and escalate only when the record reveals a genuine exception.

### Home Screen

Customer and transaction search with a unified journey view.

### Success Moment

They resolve the customer's question in one interaction using a complete and explainable record.

## Platform Administrator

### Who They Are

The Platform Administrator configures access, connections, and account-level settings that allow TraceKit to operate safely and reliably.

### The Question They Need Answered

Is TraceKit configured correctly, connected to the right systems, and accessible to the right people?

### Why That Question Matters

Incorrect connections, permissions, or configuration can create data gaps, security risk, and misleading product behavior.

### What They Care About

- Connector setup and lifecycle status
- User access and permissions
- Account configuration
- Sync and import readiness
- Security and audit history
- Clear setup requirements

### Daily Workflow

They manage users and permissions, connect or maintain business systems, monitor onboarding progress, resolve configuration issues, and confirm that each connector reaches Dashboard Ready.

### Home Screen

Administration workspace with setup status, permissions, connector health, and required actions.

### Success Moment

The right systems are syncing automatically, the right people have appropriate access, and no hidden configuration issue prevents trusted use.

## Chapter 2 Status

Complete.

# Chapter 3 — The TraceKit Experience

## Purpose

The TraceKit experience turns a fragmented business into a coherent, living financial story. It guides a customer from uncertainty and disconnected reports to a daily operating rhythm built on trusted profit, permanent attribution, and clear action.

This chapter describes the intended experience. It does not prescribe implementation architecture or claim that every capability is already complete.

## The Beginning

The customer arrives with a business already in motion. Advertising platforms report spend and conversions. Commerce systems report orders and revenue. Processors report payments, fees, refunds, and chargebacks. Affiliates and internal teams maintain their own records. Each system may be correct within its own boundaries, yet no system tells the whole story.

The customer feels the cost of that fragmentation whenever they ask a simple question and receive several different answers.

## The Decision

The decision to use TraceKit begins with a desire for certainty:

- One place to understand the business
- Profit instead of revenue alone
- Permanent attribution instead of overwritten history
- Continuous synchronization instead of repeated spreadsheet work
- Clear limitations instead of false precision

TraceKit must make that decision feel practical and credible. The product promise is not more data. It is a trustworthy explanation of what the data means.

## The Welcome

The welcome experience should establish what TraceKit will help the customer accomplish and what is required to get there. It should explain the journey in plain language, set accurate expectations, and direct the customer toward the next meaningful step.

The customer should understand that TraceKit will connect their critical business systems, preserve customer journeys, calculate qualified profit states, and surface work requiring attention. Progress must be visible, and incomplete setup must never be represented as complete.

## Connecting the Business

The customer connects the systems that describe commerce, marketing, payments, affiliates, and costs. Each connector must communicate its purpose, requested access, current state, data freshness, and any limitations.

Connection is only the beginning. Connector onboarding ends when the lifecycle is complete:

Connected → Initial Import Complete → Automatic Sync Enabled → Dashboard Ready

TraceKit should always show where a connector is in this lifecycle and what, if anything, the customer must do next.

## Bringing the Business to Life

As data arrives, TraceKit assembles orders, customers, touchpoints, campaigns, payments, fees, refunds, chargebacks, and costs into a coherent operating view.

This process should feel progressive rather than opaque. The customer should see meaningful milestones, understand which parts of the business are ready, and know which views remain partial. TraceKit must not fill gaps with invented financial mappings or silent estimates.

## The First Moment of Trust

The first moment of trust occurs when the customer recognizes their business in TraceKit and can verify a number all the way back to its source.

They see current Operational Profit, inspect what contributed to it, follow a customer from first touch through conversion, and understand any qualification or limitation attached to the result. The number is valuable because its story is visible.

This moment matters more than visual completeness. A smaller set of accurate, explainable information earns more trust than a full dashboard built on uncertainty.

## The New Morning Routine

TraceKit becomes the first place the customer checks each morning.

The Executive Dashboard answers:

- How much profit am I making right now?
- Where did that profit come from?
- Why did it change?
- What needs my attention next?

The customer sees the current state of the business, the freshness and confidence of the data, important changes since the prior check, and a prioritized set of actions. They should not need to open several platforms before they know whether the business is healthy.

## Throughout the Day

As new traffic, spend, orders, payments, refunds, and other events arrive, TraceKit keeps the operating picture current.

Founders monitor the business. Marketing leaders reallocate investment. Media buyers act on campaign economics. Affiliate managers evaluate partner quality. Operations responds to data health issues. Finance tracks exceptions moving toward reconciliation. Each persona enters through the question they need answered while relying on the same underlying story.

TraceKit should draw attention to material change without demanding constant monitoring.

## Solving Problems

When something is wrong, TraceKit should move the customer from signal to explanation to action.

An alert must explain what happened, why it matters, what information supports it, and what the customer can do next. Stale data, failed connectors, discrepancies, missing financial events, and reconciliation work must be visible and prioritized by impact.

TraceKit must never hide a limitation to preserve the appearance of a complete dashboard. When certainty is not possible, the product should state what is known, what is missing, and how the issue can be resolved.

## Understanding Every Customer

Every customer has one continuous journey in TraceKit.

The journey begins with the first click and permanently preserves the original traffic source, campaign, affiliate, or other introducing touchpoint. Returning visits and subsequent touchpoints extend the story rather than replace it. Orders, products, payments, fees, commissions, refunds, chargebacks, and relevant costs remain attached to that same journey.

Support can explain what happened. Marketing can understand acquisition. Affiliates can verify contribution. Finance can trace the financial outcome. The customer never disappears between systems or events.

## Closing the Month

During the month, Operational Profit supports timely decisions using the best qualified current information. Closing the month requires a different state of confidence.

Finance reviews discrepancies, resolves outstanding financial events, confirms authoritative mappings and provenance, and advances the period toward Reconciled Profit. TraceKit should make the remaining work explicit and preserve an auditable explanation of each adjustment.

Operational Profit must not be silently relabeled as final. Reconciled Profit is achieved through completed reconciliation, not the passage of time.

## Trust

Trust is earned through repeated transparency.

Every number must be accurate, explainable, auditable, and actionable. TraceKit should expose source provenance, calculation meaning, freshness, qualification, and known limitations at the level appropriate to the user's decision.

When sources disagree, TraceKit must not conceal the conflict. When data is stale, TraceKit must say so. When a value cannot yet be reconciled, TraceKit must distinguish it from one that has been.

## The Desired Outcome

TraceKit becomes the operating system for a profit-driven business: the place where people understand current performance, investigate the story behind it, coordinate action, and establish financial truth.

The desired outcome is not that customers spend more time inside TraceKit. It is that they spend less time assembling reports, debating which number is correct, and discovering problems too late.

## The Emotional Journey

The intended emotional journey is:

1. Uncertainty — The customer has fragmented systems and conflicting answers.
2. Clarity — TraceKit explains what it will connect and what questions it will answer.
3. Progress — The customer sees the business becoming complete as connectors import and synchronize.
4. Trust — A number can be traced to its source and explained.
5. Control — The customer knows what is happening and what needs attention.
6. Confidence — Teams make decisions from one shared source of truth.

The experience should feel calm, direct, and honest. Urgency should come from genuine business impact, not from the interface.

## The TraceKit Experience Promise

TraceKit will help each user answer the question that matters to their role while preserving one shared, auditable story of the business.

The product will connect once and sync continuously. It will put profit before revenue, preserve every customer journey, distinguish Operational Profit from Reconciled Profit, and show financial limitations rather than hide them.

At every stage—from first connection to the daily dashboard and month-end reconciliation—TraceKit will make clear what is known, why it is true, and what needs to happen next.

## Chapter 3 Status

Complete.

# Chapter 4 — How TraceKit Understands a Business

## Purpose

TraceKit does not organize information the way software systems do.

It organizes information the way business owners think.

Every screen, workflow, connector, recommendation, and report should reinforce this model.

If a feature does not strengthen one of these concepts, it should be questioned before implementation.

## The Anatomy of a Business

Every business can be understood through three connected perspectives.

### Customers

Every business exists because of its customers.

Customers are not simply contacts or CRM records.

Every customer has a story.

That story begins with a first interaction and continues through every touchpoint, purchase, refund, support interaction, and financial event.

TraceKit exists to preserve that story completely.

Questions TraceKit should answer include:

- Who is this customer?
- How did they find us?
- What has their journey been?
- What is their lifetime value?
- What relationship do we have with them today?

### Money

Money tells the financial story of the business.

Revenue alone is not the story.

Revenue changes.

Refunds occur.

Chargebacks happen.

Fees accumulate.

Advertising costs are incurred.

Affiliate commissions are paid.

Profit evolves.

TraceKit preserves the complete financial lifecycle of every dollar from the moment it enters the business until it is reconciled.

Questions TraceKit should answer include:

- Where did this revenue come from?
- What costs affected it?
- How profitable was it?
- Can the final number be trusted?

### Decisions

The purpose of TraceKit is not reporting.

The purpose of TraceKit is better decisions.

Everything in the platform should help someone decide what to do next.

Whether that decision belongs to a Founder, Media Buyer, Finance, Operations, or another user, TraceKit should reduce uncertainty and increase confidence.

Questions TraceKit should answer include:

- What changed?
- Why did it change?
- What requires my attention?
- What should I do next?

## How These Perspectives Connect

Every business follows the same story.

Customer

↓

Journey

↓

Commerce

↓

Money

↓

Decision

No event should ever exist without context.

No decision should ever exist without evidence.

## What the Customer Experiences

Customers should never think about:

- Databases
- APIs
- Queues
- Import jobs
- Connector architecture
- Reconciliation logic

They should experience one connected business.

Whether they are looking at a customer, an order, Operational Profit, or a campaign, they should feel like they are exploring different chapters of the same story.

## Behind the Scenes

Internally, TraceKit organizes information into specialized systems.

Commerce.

Attribution.

Financials.

Costs.

Operations.

Presentation.

Those systems exist only to support the customer experience.

The customer should never need to understand them.

## Guiding Principle

Every feature added to TraceKit should strengthen at least one of these three perspectives:

- Understanding customers.
- Understanding money.
- Making better decisions.

If it does not clearly strengthen one of those areas, it probably does not belong in TraceKit.

## The Business We See

Most software sees isolated records.

A CRM sees contacts.

A commerce platform sees orders.

An affiliate platform sees clicks.

A payment processor sees transactions.

TraceKit sees one business.

Every customer.

Every dollar.

Every decision.

Connected.

## Chapter Summary

A business is not a collection of disconnected systems.

It is a collection of connected stories.

Customers create journeys.

Journeys create commerce.

Commerce creates financial outcomes.

Financial outcomes drive decisions.

TraceKit exists to preserve those connections so every decision is made with confidence.

## Chapter Anchor

> TraceKit organizes information the way business owners think—not the way software does.

## Chapter Status

Chapter 4 — Complete.

# Chapter 5 — Navigation

Version: 1.0

## Purpose

Navigation in TraceKit exists to help people follow questions, stories, and evidence.

It should reflect how a person thinks about the business, not how the underlying systems are organized.

Navigation follows thought, not technology.

## Connected Workspaces

TraceKit is a collection of connected workspaces, not a collection of disconnected pages.

Each workspace helps a person answer a meaningful business question. Workspaces share evidence and related objects so a user can move through the business story without losing context or reaching a dead end.

The boundaries between workspaces should feel natural to the user. They must not expose the boundaries between internal systems.

## Permanent Context

Every workspace has one permanent context.

The permanent context establishes whose or what story the user is exploring. It remains stable while the user inspects related events, orders, payments, financial records, campaigns, or other evidence.

In the Customer Workspace, the customer is the permanent context. Orders and events are temporary inspection contexts. They provide depth without replacing the customer or sending the user into a disconnected experience.

## Every Workspace Tells a Story

Every workspace must organize information as a story:

- What is this?
- What happened?
- What is it connected to?
- Why does it matter?
- What evidence supports the conclusion?
- What should the user do next?

A workspace should reveal relationships and consequences, not merely display records. Every important object must have a home, and every related object must offer a meaningful next step.

## Universal Forensic Analysis

Universal Forensic Analysis is Pillar #3 of the TraceKit workspace philosophy.

It is a platform-wide interaction, not a separate investigation destination.

Users search evidence, not systems. Universal Search accepts any identifier, detects its likely meaning, finds related objects, and deep-links into the appropriate workspace. The correct permanent context is restored, the relevant evidence is focused, and a temporary inspection drawer provides forensic depth.

Universal Forensic Analysis brings together:

- Evidence
- Relationships
- Diagnostics
- Raw data
- Explain
- Replay Journey

Nothing should become a dead end. A user must be able to move from a conclusion to its evidence, from evidence to related objects, and from those objects back to the larger story.

## The Translation Layer

TraceKit contains complex internal systems, but customers should not need to understand them.

The Translation Layer converts internal architecture, financial states, tracking evidence, and operational conditions into language that supports a business decision.

Internal terms such as databases, APIs, queues, import jobs, canonical models, and reconciliation logic remain internal. Customer-facing language should describe what is known, what it means, how confident TraceKit is, and what needs attention.

The Translation Layer must simplify language without hiding evidence or overstating certainty.

In customer-facing UI, Estimated and Reconciled badges communicate financial confidence. The interface should not require a customer to understand the internal term Operational Profit. The underlying distinction between operational and reconciled financial states remains permanent and auditable.

## Progressive Disclosure

TraceKit should be understandable at first glance and defensible under inspection.

The default experience presents the business story, the most important conclusions, and the actions requiring attention. Additional detail appears when the user asks for it through hover previews, drawers, expanded evidence, relationships, diagnostics, raw values, and Explain.

Progressive disclosure does not hide information. It gives complexity an appropriate place.

Business owners should receive clarity. Specialists should be able to reach forensic depth without leaving the context of the business question.

## Accessibility by Default

Accessibility is a product requirement, not a later visual adjustment.

Critical information must never rely on color alone. Status and meaning should combine clear labels with icons, shape, contrast, or other redundant signals.

TraceKit will support alternate appearance palettes, including a Color Vision Optimized palette. Charts and other visualizations must remain understandable without relying solely on color.

Accessible experiences should preserve the same evidence, actions, relationships, and explanatory depth for every user.

## Explain

Every important conclusion supports Explain.

Explain should state what TraceKit concluded, why it reached that conclusion, what evidence supports it, and where uncertainty or missing evidence remains.

Raw data is never hidden. Explain translates evidence into understandable reasoning while preserving a path to the original values and related objects.

## Replay Journey

Replay Journey remains part of the product vision.

It allows a user to move through a story in sequence, observe how context and evidence accumulate, select an event, and inspect the evidence associated with that moment.

Replay should make complex journeys easier to understand without turning the experience into a separate destination.

## Product Promise

> Every important business question should be answerable by following the evidence.

## Chapter 5 Status

Chapter 5 — Complete.

# Chapter 6 — Storyboards

Status: Planned.

# Chapter 7 — Profit Engine

Status: Planned.

# Chapter 8 — Connector Framework

Status: Planned.

# Chapter 9 — Design Language

Status: Planned.

# Chapter 10 — Product Roadmap

Status: Planned.
