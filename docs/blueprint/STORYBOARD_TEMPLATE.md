# TraceKit Storyboard Template

Use this template to define and approve a product experience before implementation. Replace the guidance under each heading with storyboard-specific content.

A storyboard must be approved before Codex begins an interactive concept or production implementation.

The following sections are mandatory and must not be removed:

- Purpose
- Primary Question
- Primary Persona
- Entry Points
- Permanent Context
- Primary Sections
- Temporary Context
- Evidence
- Universal Search
- Explain
- Success Criteria
- Demo Script
- Future Enhancements
- Acceptance Criteria
- Open Questions
- Status
- Version

## Storyboard Name

Give the experience a concise, stable name.

## Status

Record one approved storyboard status from the [Storyboard Library](storyboards/README.md).

## Version

Record the storyboard version and update it when approved behavior changes.

## Purpose

Explain the customer or business problem this experience addresses and why it belongs in TraceKit.

## Primary Question

State the one business question the experience must help the user answer.

## Primary Persona

Identify the person whose core workflow and decisions drive the experience. Every storyboard must have one clearly defined primary persona.

## Secondary Users

Identify other users who consume, support, administer, or act on the experience.

## User Questions Answered

List the specific questions a user should be able to answer after using the experience.

## Success Criteria

Define observable product outcomes that indicate the experience solves its intended problem. Do not use technical completion as a substitute for customer or business success.

## Entry Points

Describe how users reach the experience, including navigation, links, alerts, and workflow transitions.

## Permanent Context

Identify the business Object that remains selected while the user investigates related information. Explain how the experience keeps that context clear.

## Primary Sections

List the essential sections of the experience in priority order and explain how each helps answer the Primary Question.

## Primary Information

Describe the information that must be immediately visible and its order of importance.

## Primary KPIs

List the key performance indicators, including exact approved names, definitions, units, and qualification where relevant.

## Primary Actions

List the actions essential to completing the user's main task.

## Secondary Actions

List useful but nonessential actions and where they should appear.

## Alerts and Warnings

Define conditions requiring attention, their severity, their wording principles, and the expected user response.

## Drill-Downs

Describe where users can inspect supporting details, provenance, calculations, or related records.

## Temporary Context

Identify the related Objects or information that open through a Drawer, Panel, or Modal while preserving the Permanent Context.

## Evidence

Define the immutable source information needed to support important conclusions. Explain where raw Evidence is available and how it remains subordinate to the default Story.

## Universal Search

List the supported Identifiers, expected result behavior, and the exact Workspace, Object, or Evidence state restored after selection.

## Explain

Identify every important conclusion that requires Explain. Define the reasoning, Evidence, confidence, limitations, and next steps each explanation must provide.

## Data Sources

Identify authoritative and supporting data sources without inventing unavailable integrations or mappings.

## Data Freshness Requirements

Define acceptable age, expected update cadence, freshness indicators, and behavior when data is delayed.

## Profit/Attribution Implications

Explain how the experience affects profit definitions, financial confidence, attribution, provenance, and the preserved customer journey.

## Desktop Layout

Describe hierarchy, regions, density, and interaction behavior for desktop viewports.

## Tablet Layout

Describe how hierarchy and interactions adapt for tablet viewports.

## Mobile Layout

Describe the essential information, action priority, stacking, and navigation behavior for mobile viewports.

## Loading State

Define what appears while required data is loading and how layout stability is maintained.

## Empty State

Define what users see when no qualifying data exists and the next useful action they can take.

## Partial Data State

Define how incomplete sources or calculations are disclosed without implying unsupported completeness.

## Stale Data State

Define stale thresholds, visible freshness information, warnings, and recovery actions.

## Error State

Define recoverable and terminal failures, user-facing explanations, retry behavior, and escalation paths.

## Permissions

Specify who may view or act, how restricted content behaves, and any role-dependent differences.

## Accessibility

Record requirements for keyboard use, focus, semantics, contrast, nonvisual status communication, and assistive technology.

## Analytics / Product Events

List the product events needed to evaluate adoption and workflow success, excluding sensitive or unnecessary data.

## Out of Scope

State related capabilities and edge cases intentionally excluded from this storyboard.

## Demo Script

Provide a concise demonstration sequence showing how the Workspace can be presented in approximately 90 seconds. The sequence should begin with a meaningful question or Evidence and end with a clear business outcome.

## Future Enhancements

List functionality intentionally excluded from the current version to prevent scope creep. Include only ideas already supported by approved product documents.

## Open Questions

List unresolved decisions, owners when known, and what evidence is needed to resolve them.

## Decisions Made

Record approved decisions and link to the [Product Decision Log](PRODUCT_DECISIONS.md) when appropriate.

## Acceptance Criteria

Define the conditions that must be true before the concept can be approved for production implementation. Criteria must cover product behavior, terminology, Evidence, accessibility, trust, and the Primary Question.
