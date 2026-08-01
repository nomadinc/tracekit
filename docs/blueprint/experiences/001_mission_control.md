# Experience Storyboard 001 — Mission Control

Version: 1.0

Status: Approved for Prototype

## One Sentence Test

Show me what matters right now, why it matters, and where I should go next.

## Purpose

Mission Control is the home experience of TraceKit.

Unlike traditional dashboards, Mission Control does not attempt to answer every business question.

Mission Control is an attention-management system.

Its purpose is to prioritize what requires attention and route users into the appropriate workspace.

Mission Control orchestrates the platform.

Workspaces perform the investigation.

## Primary Question

What requires my attention right now?

## Primary Personas

- Founder / CEO
- Product Owner
- Marketing Director
- Media Buyer
- Affiliate Manager
- Finance
- Operations

## Experience Philosophy

Mission Control is not a reporting page.

Mission Control is not another dashboard.

Mission Control answers one question:

Where should I go next?

Every item should route the user into a Workspace.

Mission Control never replaces a Workspace.

## First Five Seconds

Without clicking anything the user should understand:

- Is my business healthy?
- Did anything important change?
- Is there an opportunity?
- Is there a risk?
- Where should I investigate first?

## Primary Sections

### Welcome

Simple greeting.

Examples:

Good morning.

Welcome back.

No unnecessary personalization.

### Continue Where You Left Off

Resume the previous investigation.

Example:

Yesterday you were investigating:

Bullseye

Shipping Margin

Resume →

### Business Health

High-level health summary.

Example:

Business Health

Healthy

2 Opportunities

1 Warning

0 Critical

This is not a KPI dashboard.

It is a concise status summary.

### Attention Required

The primary section of Mission Control.

Every item should answer:

Should I investigate this?

Examples:

Bullseye

Shipping Margin declined 18%.

Open Offer →

Meta

CPA increased 22%.

Investigate →

ValueRx

Highest weekly profit.

View →

Each item routes directly into the correct Workspace.

### TraceKit Intelligence

Mission Control displays a concise daily briefing.

Examples:

Opportunity

Affiliate traffic now outperforms Meta.

Risk

Refund rate increased after the latest landing page update.

Recommendation

Increase Google budget by 15%.

Every recommendation supports:

- Explain
- Evidence
- Workspace

Mission Control does not contain AI chat.

### Recent Activity

Resume previous investigations.

Examples:

Bullseye

Viewed 2 hours ago

Open →

Customer

John Smith

Investigated yesterday

Resume →

### Recent Searches

Display recent Universal Search items.

Examples:

- Everflow Transaction ID
- Bullseye
- Customer
- Order

Clicking resumes the previous investigation.

### Favorite Businesses

Display Business Context selectors.

Examples:

- Bullseye
- ValueRx
- Pete's Pasta
- Manifest RX

Each uses:

- Logo
- Name
- Selected state

Clicking opens the Offer Workspace.

## Navigation Philosophy

Mission Control routes users into:

Offer Workspace

↓

Customer Workspace

↓

Order Workspace

↓

Evidence

Mission Control performs prioritization.

Workspaces perform investigation.

## Universal Search

Always available.

Keyboard:

⌘K

Ctrl+K

Users may immediately search instead of browsing.

## MCP Chat

MCP Chat is part of Core.

It is reactive.

Example prompts:

"What changed today?"

"Show refunded orders."

"Which Offer had the highest profit?"

Every response links directly into the correct Workspace.

## TraceKit Intelligence

Separate future add-on.

Mission Control displays only:

- Opportunities
- Warnings
- Recommendations
- Risks

No conversational interface.

Everything is actionable.

Every recommendation links to:

- Explain
- Evidence
- Workspace

## Success Criteria

Within five seconds the user should understand:

- Business Health
- What changed
- Which opportunity exists
- Which risk requires attention
- Where to investigate first

Within one click they should enter the appropriate Workspace.

## Demo Script

1. Log in.
2. Mission Control loads.
3. Review Business Health.
4. Review Attention Required.
5. Open Bullseye.
6. Enter Offer Workspace.
7. Open Order.
8. Inspect Customer.
9. Return.
10. Ask MCP:
    "What changed today?"
11. Review TraceKit Intelligence recommendation.
12. Open supporting Evidence.

## Future Enhancements

- Personalized Mission Control
- Team priorities
- Assigned investigations
- Daily briefings
- Weekly executive summaries
- Forecasting
- Scheduled Intelligence reports
- Cross-business benchmarking

## Open Questions

- Should Home be called Home or Mission Control?
- Should Business Context appear directly on Mission Control?
- Should users resume the last viewed Offer automatically?
- Should Attention Required prioritize by financial impact?
- Should users pin investigations?
- Should Compare Mode launch directly from Mission Control?

## Acceptance Criteria

Mission Control is approved when:

- It never feels like a traditional dashboard.
- Users immediately know where to go next.
- Every recommendation routes into a Workspace.
- Workspaces remain responsible for investigation.
- Mission Control remains responsible for prioritization.
- MCP Chat remains reactive.
- TraceKit Intelligence remains proactive.
- Business Context remains consistent with the rest of TraceKit.
- The experience feels calm, intentional, and uncluttered.

## Decisions Made

- Mission Control is a Platform Experience, not a Workspace.
- Mission Control orchestrates Workspaces rather than replacing them.
- It answers "What requires my attention right now?"
- It routes users into Offer, Customer, and Order Workspaces.
- Business Health summarizes rather than reports.
- Attention Required is the hero section.
- Universal Search and MCP Chat remain Core capabilities.
- TraceKit Intelligence is a separate future add-on.
- Mission Control should feel calm and focused rather than like a KPI dashboard.
