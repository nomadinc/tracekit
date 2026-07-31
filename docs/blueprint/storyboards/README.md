# TraceKit Storyboard Library

## Purpose

The storyboard library contains the approved product definitions for TraceKit Workspaces and major interactive experiences.

A storyboard translates the Product Blueprint, Object Model, and Workspace Design System into a reviewable experience before an interactive concept or production implementation begins.

## Numbering Convention

Storyboards use a three-digit sequence that remains stable for the life of the document:

- `001_customer_workspace.md`
- `002_order_workspace.md`
- `003_campaign_workspace.md`
- `004_affiliate_workspace.md`
- `005_financial_workspace.md`
- `006_connector_workspace.md`
- `007_product_workspace.md`

Numbers indicate library order, not implementation priority.

## File Naming Convention

Use:

`NNN_descriptive_workspace_name.md`

File names use lowercase letters, numbers, and underscores. Renaming an approved storyboard should be avoided because other product documents, concepts, and reviews may link to it.

## Versioning

Each storyboard records a version.

- Begin at version 1.0 when first approved for a prototype.
- Increase the minor version for approved clarifications that preserve the experience's purpose and Primary Question.
- Increase the major version when the Permanent Context, primary behavior, or approved scope changes materially.
- Preserve earlier decisions in version history when a storyboard is revised after approval.

## Status Values

Every storyboard uses one of these approved statuses:

- Draft
- In Review
- Approved for Prototype
- Prototype in Review
- Approved for Production
- Superseded
- Archived

## Approval Process

The product lifecycle is:

Idea
→ Blueprint
→ Object Model
→ Workspace Design System
→ Storyboard
→ Interactive Concept
→ Product Review
→ Approval
→ Production Build

A storyboard begins as Draft, moves to In Review, and must reach Approved for Prototype before an interactive concept begins.

After the concept is available, the storyboard and concept move through Prototype in Review using the [Product Review Checklist](../PRODUCT_REVIEW_CHECKLIST.md). Production implementation may begin only after the outcome is Approved for Production.

Approval must confirm:

- The business Object is defined.
- The Primary Question is clear.
- The Permanent Context is correct.
- Workspace behavior follows the Workspace Design System.
- Terminology follows the TraceKit Lexicon.
- Scope, Future Enhancements, Open Questions, and Acceptance Criteria are explicit.

## Relationship to Interactive Concepts

An interactive concept demonstrates an approved storyboard.

The concept may use realistic mock data to test hierarchy, Story, investigation, accessibility, and interaction behavior. It must not invent product behavior outside the storyboard.

Review findings may return the work to the storyboard. The storyboard remains the product authority; the concept is evidence used to evaluate it.

## Relationship to Production Implementation

Production implementation must conform to the storyboard version approved for production.

Implementation may resolve technical details, but it must not redefine the business Object, Primary Question, Permanent Context, product terminology, financial meaning, or approved Workspace behavior.

> No production feature should be built until its business object, workspace behavior, and storyboard have been approved.

## Changes After Approval

When product behavior changes after approval:

1. Record the proposed change in the storyboard.
2. Return the storyboard to In Review.
3. Update its version according to the scope of the change.
4. Identify affected concepts, acceptance criteria, and production behavior.
5. Repeat Product Review when the approved experience changes materially.
6. Mark a replaced storyboard Superseded rather than rewriting its history.

Archived storyboards remain available as historical product context but must not govern current implementation.
