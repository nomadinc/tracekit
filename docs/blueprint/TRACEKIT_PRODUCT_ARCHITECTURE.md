# TraceKit Product Architecture

Version: 1.0

Status: Approved

## Purpose

This document is the highest-level map of the TraceKit product.

It describes:

- Major platform experiences
- Core Workspaces
- Product hierarchy
- User flow
- Product layers
- Navigation philosophy
- Where future capabilities belong

This is not a technical architecture document or a software architecture document. It explains how TraceKit fits together from a business and user-experience perspective.

This should be the first document new team members read after the [TraceKit Product Blueprint](TRACEKIT_PRODUCT_BLUEPRINT.md).

## Product Vision

TraceKit is a business operating system.

Its purpose is to help businesses understand what happened, prove why it happened, and decide what to do next.

Every important business decision should be supported by explainable evidence.

## Product Architecture Map

This map represents the product experience and decision flow. It does not represent databases, services, or software components.

```text
                              TRACEKIT
                                  │
                ┌─────────────────┼─────────────────┐
                │                 │                 │
        Universal Search       MCP Chat      TraceKit Intelligence
                │                 │                 │
                └─────────────────┼─────────────────┘
                                  ↓
                           Mission Control
                                  ↓
                         Business Context
                                  ↓
                          Offer Workspace
                                  ↓
                         Traffic Sources
                                  ↓
                             Campaigns
                                  ↓
                              Ad Sets
                                  ↓
                             Creatives
                                  ↓
                             Customers
                                  ↓
                               Orders
                                  ↓
                              Evidence
                                  ↓
                         Business Decisions
```

Universal Search and MCP Chat provide Core entry points into the appropriate Workspace and Evidence. TraceKit Intelligence proactively identifies opportunities, risks, patterns, and recommendations supported by the same Evidence.

## Product Layers

### Layer 1 — Mission Control

Purpose:

> What requires my attention right now?

Mission Control prioritizes.

It does not investigate.

### Layer 2 — Business Context

Purpose:

Select the business currently being managed.

Changing Business Context changes the active Offer while preserving the same TraceKit experience.

### Layer 3 — Offer Workspace

Purpose:

Strategic decision making.

Primary Question:

> Should I invest more money in this Offer?

### Layer 4 — Investigation Workspaces

Investigation Workspaces include:

- Customer Workspace
- Order Workspace
- Future Financial Workspace
- Future Connector Workspace
- Future Product Workspace

These explain why something happened.

### Layer 5 — Evidence

Evidence is the immutable facts supporting every conclusion.

## Workspace Library

### Approved

- Customer Workspace
- Order Workspace
- Offer Workspace

### Planned

- Financial Workspace
- Connector Workspace
- Product Workspace

Campaign is a tactical child Workspace beneath Offer.

## Experience Library

### Approved

- Mission Control

### Planned

- Login
- Client Portal
- Admin Portal
- Onboarding
- Setup Wizards

Experiences orchestrate the platform.

Workspaces investigate business Objects.

## Business Context

Business Context is not a report filter.

Changing Business Context changes the business currently being managed.

Business Context uses:

- Logo
- Name
- Selected state

Every Workspace inherits the selected Business Context.

## Entry Points

Users interact with TraceKit in three approved ways.

```text
Browse
  ↓
Mission Control
  ↓
Workspaces

--------------------

Search
  ↓
Universal Search
  ↓
Workspace

--------------------

Ask
  ↓
MCP Chat
  ↓
Workspace
```

All three ultimately lead to the same evidence-backed truth.

## TraceKit Intelligence

### Core

- Workspaces
- Universal Search
- Explain
- Evidence
- MCP Chat

### TraceKit Intelligence

- Opportunity Detection
- Risk Detection
- Recommendations
- Pattern Detection
- Forecasting
- Executive Briefings
- Compare Analysis

MCP Chat is reactive.

TraceKit Intelligence is proactive.

TraceKit Intelligence builds on Evidence rather than replacing it.

## Product Journey

The normal user flow is:

```text
Log In
  ↓
Mission Control
  ↓
Business Context
  ↓
Offer Workspace
  ↓
Customer
  ↓
Order
  ↓
Evidence
  ↓
Business Decision
```

## Design Principles

- Navigation follows thought, not technology.
- Every Workspace has one permanent context.
- Every important business decision should be supported by explainable evidence.
- Workspaces tell stories.
- Mission Control prioritizes.
- Workspaces investigate.
- Evidence creates trust.
- Explain creates understanding.
- TraceKit Intelligence creates recommendations.
- Users should never have to wonder where to go next.

## Future Product Direction

- Workspace Library expansion
- Experience Library expansion
- TraceKit Intelligence expansion

New features should naturally fit into this architecture.

## Conclusion

The Product Architecture exists to ensure every future feature strengthens the product rather than adding complexity.

If a proposed feature does not naturally fit within this architecture, the product team should reconsider whether it belongs in TraceKit.
