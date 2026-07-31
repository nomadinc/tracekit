# TraceKit Object Model

Version: 1.0
Status: Living Document

## Purpose

The TraceKit Object Model defines the business objects that exist within the TraceKit universe.

It establishes a shared product language for the people, journeys, commercial activity, financial outcomes, sources, and evidence that make up a business.

This is not a database schema.

This is not implementation documentation.

The Object Model describes what each object means, why it exists, how it relates to the larger business story, and where a user should understand it.

## Design Philosophy

TraceKit sees one connected business.

Objects do not exist as isolated records. Each object contributes to a story, connects to other objects, and helps answer a business question.

The Object Model follows these principles:

- Business meaning comes before system structure.
- Every object has a clear purpose.
- Every object tells part of a story.
- Every relationship should be explainable.
- Every important conclusion should lead to evidence.
- Every object should have a natural workspace.
- Permanent context should survive temporary inspection.
- Internal system boundaries should remain invisible to the customer.

## Object Hierarchy

The TraceKit universe begins with an Organization.

Within an Organization, Customers move through Journeys made of Touchpoints. Identifiers connect observed evidence to the right Customer and Journey.

Journeys lead to Orders containing Products. Campaigns and Affiliates may influence those journeys and commercial outcomes.

Orders create Financial Events. Connectors bring observable information into TraceKit. Evidence supports every relationship, status, calculation, and conclusion.

The hierarchy is connected rather than rigid:

Organization

↓

Customer → Journey → Touchpoint

↓

Order → Product → Financial Event

Campaign and Affiliate influence the journey.

Identifier connects the story.

Connector provides observable source information.

Evidence explains what TraceKit knows.

## Organization

### Purpose

An Organization represents the business using TraceKit.

It provides the shared context in which customers, journeys, commerce, financial outcomes, connectors, and decisions belong together.

### Primary Question

What is happening across this business, and what requires attention?

### Relationships

An Organization contains Customers, Journeys, Orders, Products, Campaigns, Affiliates, Financial Events, and Connectors. Its Evidence supports business-wide conclusions and decisions.

### Workspace

The Organization is the permanent context of the Executive Workspace and other business-wide workspaces.

## Customer

### Purpose

A Customer represents a person or business with a continuing relationship to the Organization.

A Customer is not merely a contact record. The Customer is the permanent subject connecting discovery, identity, journeys, purchases, refunds, support interactions, and financial outcomes.

### Primary Question

Tell me everything about this customer.

### Relationships

A Customer may have multiple Identifiers, Journeys, Touchpoints, Orders, and Financial Events. Campaigns and Affiliates may have introduced or influenced the Customer.

### Workspace

The Customer is the permanent context of the Customer Workspace.

## Journey

### Purpose

A Journey represents the complete sequence of interactions connecting a Customer's first known touch to later commercial and financial outcomes.

The Journey preserves first touch and every meaningful subsequent touchpoint. It does not reset when the Customer returns, converts, purchases again, receives a refund, or experiences another financial event.

### Primary Question

How did this customer move from first interaction to the current outcome?

### Relationships

A Journey belongs to a Customer and contains Touchpoints. It may connect to Campaigns, Affiliates, Orders, Financial Events, Identifiers, and Evidence.

### Workspace

The Journey is a central story within the Customer Workspace and may become temporary context during forensic inspection or Replay Journey.

## Touchpoint

### Purpose

A Touchpoint represents a meaningful interaction within a Journey.

It may describe discovery, a redirect, a visit, a conversion step, a purchase event, a payment event, a financial update, or another observed moment that changes the story.

### Primary Question

What happened at this moment, and how did it affect the journey?

### Relationships

A Touchpoint belongs to a Journey and may carry Identifiers, connect to a Campaign or Affiliate, lead to an Order, correspond to a Financial Event, and retain supporting Evidence.

### Workspace

Touchpoints appear in the story of the Customer Workspace and become temporary context in an evidence drawer.

## Identifier

### Purpose

An Identifier is a known value that helps connect evidence to the right business object.

Identifiers may represent a customer, session, journey, click, order, affiliate transaction, payment, or financial event. Their meaning comes from the objects and evidence they connect, not from the source system alone.

### Primary Question

What business story does this identifier belong to?

### Relationships

An Identifier may connect a Customer, Journey, Touchpoint, Order, Affiliate, Financial Event, or piece of Evidence. One object may have many Identifiers, and one investigation may use several Identifiers to establish a relationship.

### Workspace

Identifiers are entry points through Universal Search and appear as evidence within the workspace that owns the related story.

## Order

### Purpose

An Order represents a commercial commitment between a Customer and the Organization.

It brings together purchased Products, revenue, discounts, status changes, attribution, payments, refunds, and other financial consequences.

### Primary Question

What happened in this sale, and how profitable was it?

### Relationships

An Order belongs to a Customer and may connect to a Journey, Touchpoints, Products, Campaigns, Affiliates, Identifiers, Financial Events, and Evidence.

### Workspace

An Order is temporary context within the Customer Workspace and a primary object within commerce- and financial-focused workspaces.

## Product

### Purpose

A Product represents what the Organization offers and what a Customer acquires through an Order.

It provides the commercial meaning behind quantities, prices, discounts, costs, refunds, and profit contribution.

### Primary Question

What did the customer buy, and what financial outcome did it create?

### Relationships

A Product appears in Orders and may connect to Campaigns, Customers, Financial Events, costs, and Evidence about revenue and profitability.

### Workspace

Products belong in commerce, product-performance, and profit workspaces. They may also appear as related objects in Customer and Order inspection.

## Campaign

### Purpose

A Campaign represents an organized marketing effort intended to create customer attention, journeys, commerce, and profit.

It provides a durable business context for evaluating marketing performance beyond clicks, conversions, or revenue alone.

### Primary Question

Which campaign created profitable customer outcomes, and why?

### Relationships

A Campaign may generate Touchpoints, influence Journeys, introduce Customers, produce Orders, involve Affiliates, incur Financial Events or costs, and retain attribution Evidence.

### Workspace

The Campaign is a primary context in marketing workspaces and a related object within Customer, Journey, Order, and financial stories.

## Affiliate

### Purpose

An Affiliate represents a partner that introduces or influences Customers and may earn commission from attributed outcomes.

The Affiliate object preserves contribution, attribution, customer quality, commission, refunds, chargebacks, and downstream profitability as one connected story.

### Primary Question

Which customers and profitable outcomes did this affiliate create?

### Relationships

An Affiliate may connect to Campaigns, Touchpoints, Journeys, Customers, Orders, Identifiers, Financial Events, commissions, and Evidence.

### Workspace

The Affiliate is a primary context in the Affiliate Workspace and a related object in Customer, Journey, Order, Campaign, and financial inspection.

## Financial Event

### Purpose

A Financial Event represents a change to the financial story of the business.

It may describe a payment, fee, refund, chargeback, commission, shipping cost, advertising cost, adjustment, reconciliation, or another event that changes a financial outcome.

### Primary Question

What changed the money, why did it change, and can the result be trusted?

### Relationships

A Financial Event may connect to an Organization, Customer, Journey, Order, Product, Campaign, Affiliate, Connector, Identifier, and supporting Evidence.

### Workspace

Financial Events are primary objects in financial and reconciliation workspaces. They also appear as temporary context inside Customer, Order, Campaign, and Affiliate stories.

## Connector

### Purpose

A Connector represents the relationship between TraceKit and a business system that contributes observable information.

The Connector explains where information comes from, whether it is current, what business meaning it supports, and what limitations require attention.

### Primary Question

Is this source providing complete, current, and trustworthy information?

### Relationships

A Connector may provide Evidence about Customers, Journeys, Touchpoints, Identifiers, Orders, Products, Campaigns, Affiliates, and Financial Events.

### Workspace

The Connector is a primary context in connection, setup, and operational health workspaces. Its status may appear wherever source freshness or limitations affect a conclusion.

## Evidence

### Purpose

Evidence represents the observable support for a relationship, status, classification, calculation, or conclusion.

Evidence preserves what TraceKit observed, where it came from, when it occurred, how it relates to the business story, and what remains uncertain.

### Primary Question

What supports this conclusion, and what can be verified?

### Relationships

Evidence may support every object in the TraceKit universe. It connects Identifiers, source observations, timestamps, URLs, parameters, financial values, relationships, diagnostics, confidence, and limitations.

### Workspace

Evidence belongs in the workspace that owns the business question. It becomes visible through progressive disclosure, drawers, Universal Forensic Analysis, and Explain.

## Relationships

Relationships turn individual objects into a connected business.

Every relationship should answer:

- What objects are connected?
- Why are they connected?
- What evidence supports the connection?
- How confident is TraceKit?
- What could weaken or change the conclusion?
- Where can the user inspect the related story?

Important relationships include:

- An Organization has Customers.
- A Customer has Journeys.
- A Journey contains Touchpoints.
- An Identifier connects evidence to an object.
- A Journey may lead to an Order.
- An Order contains Products.
- A Campaign or Affiliate may influence a Journey and Order.
- An Order creates Financial Events.
- A Connector contributes observable source information.
- Evidence supports every important relationship and conclusion.

Relationships must be navigable and explainable.

No object should become a dead end.

## Universal Search

Universal Search allows a user to enter the TraceKit universe through any known Identifier.

The user should not need to know which system owns the value or which object type to search. TraceKit identifies its likely meaning, finds related objects, and deep-links into the workspace that owns the story.

Universal Search should restore the appropriate permanent context, focus the relevant object or Touchpoint, and make the matching Evidence available for inspection.

Users search evidence, not systems.

## Explain

Every important object, relationship, status, and conclusion supports Explain.

Explain should state:

- What TraceKit understands
- Why TraceKit understands it that way
- Which objects are involved
- What Evidence supports the conclusion
- How confident TraceKit is
- What is missing, conflicting, or uncertain
- What the user can inspect or do next

Explain must preserve the distinction between observation, inference, and certainty.

Raw values and source meaning remain available. Simpler language must never require hidden evidence.

## Design Rules

1. The Object Model describes business meaning, not system structure.
2. Every object has one clear purpose.
3. Every object answers an important business question.
4. Every object has a natural workspace.
5. Every object tells part of a story.
6. Every relationship must be explainable.
7. Every important conclusion must lead to Evidence.
8. Identifiers connect stories; they do not define them.
9. Permanent context must survive temporary inspection.
10. Internal source boundaries remain internal.
11. Universal Search accepts the evidence the user already has.
12. Raw data is never hidden.
13. Nothing is a dead end.
14. Complexity belongs in implementation.
15. Simplicity belongs in the experience.

> The purpose of every object in TraceKit is to help someone make a better business decision.
