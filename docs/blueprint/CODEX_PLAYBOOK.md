# TraceKit Codex Playbook

## Purpose

This document tells Codex how to work inside the TraceKit repository.

## Project Identity

- Product: TraceKit
- Repository: `/Users/nomadm/Projects/tracekit`
- Product purpose: Operating system for profit-driven businesses
- North Star:

> Every dollar tells a story. TraceKit's job is to preserve that story—from the customer's first click to the final reconciled profit.

## Authoritative Documents

Before architecture or product work, Codex must read the documents relevant to the requested scope:

- [TraceKit Product Blueprint](TRACEKIT_PRODUCT_BLUEPRINT.md)
- [TraceKit Object Model](OBJECT_MODEL.md)
- [TraceKit Workspace Design System](WORKSPACE_DESIGN_SYSTEM.md)
- [TraceKit Lexicon](TRACEKIT_LEXICON.md)
- [Storyboard Template](STORYBOARD_TEMPLATE.md)
- [Product Review Checklist](PRODUCT_REVIEW_CHECKLIST.md)
- [Profit Engine Specification](../architecture/PROFIT_ENGINE_SPEC_V1.md)
- [Executive Dashboard Validation](../architecture/EXECUTIVE_DASHBOARD_VALIDATION.md)
- [Connector Backlog](../architecture/CONNECTOR_BACKLOG.md)
- Relevant storyboard documents, when they exist

Product intent is governed by the Product Blueprint. Architecture documents govern how approved intent is implemented. Any conflict must be surfaced before implementation continues.

## Development Workflow

Use this lifecycle:

Blueprint  
→ Storyboard  
→ Implementation  
→ Review  
→ Commit  
→ Deploy  
→ Validation

Do not skip a stage that is required by the scope or risk of the work.

## Product Lifecycle

Major product work uses this lifecycle:

Idea
→ Blueprint
→ Object Model
→ Workspace Design System
→ Storyboard
→ Interactive Concept
→ Product Review
→ Approval
→ Production Build

Permanent product rules:

- The Product Blueprint drives development, not the other way around.
- No production feature should be built until its business object, workspace behavior, and storyboard have been approved.
- Codex must not invent product behavior when an approved storyboard exists.
- Interactive concepts use mock data unless live data is explicitly approved.
- Product review occurs before production implementation.
- Production code must not redefine product terminology established in [TRACEKIT_LEXICON.md](TRACEKIT_LEXICON.md).
- Internal architectural terminology should not appear in user-facing copy unless it helps the user make a decision.
- Important states must not rely on color alone.

### Terminology Guidance

Prefer:

- Workspace
- View
- Panel
- Drawer
- Modal

Use “page” only when discussing routing or implementation.

## Core Engineering Rules

- Preserve existing architecture unless a confirmed defect requires change.
- Reuse existing importers, queues, helpers, and canonical models.
- Do not create parallel pipelines without explicit approval.
- Do not invent financial mappings.
- Do not silently estimate missing financial values.
- Preserve source provenance.
- Maintain idempotency and auditability.
- Customer-facing language must use approved terminology.
- Snapshot Mode replaces diagnostic-only in customer-facing UI.
- Do not label Revenue After Affiliate Commission as profit.
- Do not show unqualified Net Profit.
- Operational Profit and Reconciled Profit must remain distinct.

## Safety Rules

- Do not deploy without explicit approval.
- Do not push without explicit approval.
- Do not commit without explicit approval.
- Do not run migrations without explicit approval.
- Do not run imports or backfills without explicit approval.
- Do not call processor APIs during read-only reviews.
- Do not mutate production during diagnostics.
- Do not expose secrets, credentials, personally identifiable information (PII), payment data, or raw financial payloads.
- Stop and explain when a migration or production mutation appears necessary.

## Review Requirements

Before requesting commit approval:

- List changed files.
- Summarize the confirmed root cause or objective.
- Run focused tests.
- Run full relevant test suites.
- Run typecheck, lint, and build where applicable.
- Run a Wrangler dry run where applicable.
- Run `git diff --check`.
- Return `git status --short`.
- Identify remaining blockers.
- Confirm that no prohibited actions occurred.

Tests and build checks should be proportional to the work. Documentation-only changes do not require unrelated application test suites unless they affect generated or validated behavior.

## Repository Discipline

- Confirm the working directory before modifying files.
- Confirm the Git branch.
- Inspect existing documentation and implementation first.
- Modify only approved files.
- Avoid broad refactors during narrow bug fixes.
- Keep documentation and tests aligned with behavior.
