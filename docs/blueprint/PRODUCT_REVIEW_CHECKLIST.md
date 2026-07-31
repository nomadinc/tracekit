# TraceKit Product Review Checklist

Version: 1.0
Status: Living Document

## Purpose

This checklist is the quality gate for every interactive concept and Workspace before production implementation.

Reviewers should evaluate the experience against approved product intent, the [Object Model](OBJECT_MODEL.md), the [Workspace Design System](WORKSPACE_DESIGN_SYSTEM.md), the [TraceKit Lexicon](TRACEKIT_LEXICON.md), and its approved storyboard.

## 1. Purpose and Primary Question

- [ ] Is the Workspace's purpose explicit?
- [ ] Is there one clearly stated primary question?
- [ ] Does every primary section help answer that question?
- [ ] Is the correct business Object the focus?
- [ ] Is functionality outside the approved purpose excluded or clearly deferred?

## 2. Clarity

- [ ] Is the experience understandable without knowledge of TraceKit's internal architecture?
- [ ] Are labels concise, specific, and consistent with the TraceKit Lexicon?
- [ ] Is the information hierarchy obvious?
- [ ] Are primary actions distinguishable from secondary actions?
- [ ] Can the user identify what needs attention and what to do next?

## 3. First-Impression Test

- [ ] Can a first-time user understand the Workspace's purpose within ten seconds?
- [ ] Can the user identify the Permanent Context immediately?
- [ ] Can the user answer the Workspace's primary question without opening raw Evidence?
- [ ] Are the most important state, conclusion, and next action visible?

## 4. Storytelling

- [ ] Does the Story appear before technical detail?
- [ ] Does the Workspace explain how the Object reached its current state?
- [ ] Are sequence, cause, consequence, and uncertainty understandable?
- [ ] Do Related Objects strengthen the Story rather than fragment it?
- [ ] Does every important Object lead to a meaningful next step?

## 5. Permanent Context

- [ ] Is the permanent Object context always clear?
- [ ] Does the Permanent Context remain selected during investigation?
- [ ] Are identity, state, and essential summary visible at the appropriate times?
- [ ] Can the user return from deeper inspection without losing place?

## 6. Temporary Context

- [ ] Are temporary Objects clearly subordinate to the Permanent Context?
- [ ] Do drawers preserve context?
- [ ] Does closing a Drawer, Panel, or Modal restore the same place and state?
- [ ] Is Temporary Context used instead of unnecessary navigation?

## 7. Investigation

- [ ] Can a tracking expert investigate without leaving the Workspace?
- [ ] Can the user move from a conclusion to supporting Evidence?
- [ ] Are URLs, Identifiers, timestamps, Relationships, and diagnostics available when relevant?
- [ ] Does investigation preserve the larger business Story?
- [ ] Is nothing a dead end?

## 8. Universal Search

- [ ] Does Universal Search accept the Identifiers defined by the approved storyboard?
- [ ] Does it detect and communicate the likely Identifier type?
- [ ] Can Universal Search deep-link into the exact matching Object or Evidence?
- [ ] Does selection restore the correct Permanent Context?
- [ ] Is the matching Object or Touchpoint focused and highlighted?
- [ ] Is the searched Identifier preserved in context?

## 9. Universal Forensic Analysis

- [ ] Can the user follow an important conclusion through Evidence, Relationships, diagnostics, and Explain?
- [ ] Is forensic analysis available inside the relevant Workspace rather than as a disconnected destination?
- [ ] Are observation, inference, confidence, and certainty distinct?
- [ ] Can raw information be inspected without becoming the default experience?

## 10. Explain

- [ ] Does every important conclusion support Explain?
- [ ] Does Explain state what TraceKit concluded and why?
- [ ] Does it identify supporting Evidence?
- [ ] Does it disclose missing, conflicting, or uncertain Evidence?
- [ ] Does it provide a useful next inspection or action?

## 11. Evidence

- [ ] Is raw Evidence available without being the default experience?
- [ ] Is source meaning and provenance understandable?
- [ ] Is immutable source information visually distinct from TraceKit's interpretation?
- [ ] Can the user copy or inspect important raw values when appropriate?
- [ ] Are Evidence Relationships explicit?

## 12. Translation Layer

- [ ] Are internal architectural terms translated into business language?
- [ ] Does customer-facing copy explain what is known, what it means, and what needs attention?
- [ ] Does simplification preserve Evidence, confidence, and limitations?
- [ ] Is “page” avoided when Workspace, View, Panel, Drawer, or Modal is more accurate?

## 13. Status and Trust

- [ ] Are Estimated and Reconciled understandable without documentation?
- [ ] Is Profit always qualified with the appropriate status?
- [ ] Are known limitations visible rather than hidden?
- [ ] Are stale, partial, conflicting, and unavailable states distinguished?
- [ ] Does the interface avoid unsupported certainty?

## 14. Accessibility

- [ ] Does any important state rely on color alone?
- [ ] Do status indicators include text and/or icons?
- [ ] Is contrast sufficient for text, controls, focus, and state?
- [ ] Is keyboard navigation complete and predictable?
- [ ] Is focus visible and reading order logical?
- [ ] Are controls and Evidence available to assistive technology?

## 15. Color Vision Accessibility

- [ ] Does the interface remain understandable in grayscale?
- [ ] Are adjacent status colors clearly distinguishable?
- [ ] Do charts use labels, line styles, marker shapes, or patterns in addition to color?
- [ ] Do Journey states use labels, icons, shape, or pattern in addition to color?
- [ ] Does the experience remain coherent in the Color Vision Optimized appearance palette?

## 16. Executive Experience

- [ ] Can a business owner understand the current Story without specialist knowledge?
- [ ] Are Profit, source, material problem, and next action easy to identify?
- [ ] Is technical detail available without dominating the default experience?
- [ ] Does the Workspace support a confident business decision?

## 17. Expert Experience

- [ ] Can a tracking expert inspect complete Evidence and Relationships?
- [ ] Can the expert determine why attribution or Tracking Health was assigned?
- [ ] Can the expert identify where an Identifier originated, propagated, or was lost?
- [ ] Are diagnostics careful not to claim knowledge TraceKit does not possess?
- [ ] Can expert depth be reached without losing the Permanent Context?

## 18. Empty, Loading, Error, and Partial-Data States

- [ ] Does the empty state explain why no information is present and what to do next?
- [ ] Does the loading state preserve layout and communicate progress appropriately?
- [ ] Does the error state explain the impact and available recovery?
- [ ] Does the partial-data state identify what is available and what is missing?
- [ ] Are stale data and unavailable Evidence clearly disclosed?

## 19. Responsiveness

- [ ] Is the primary desktop workflow efficient at investigation density?
- [ ] Does the information hierarchy remain intact at narrower widths?
- [ ] Can lists collapse without hiding the Permanent Context?
- [ ] Can Drawers become full-width when necessary?
- [ ] Can wide Journeys and dense Evidence be inspected without loss of meaning?

## 20. Performance Perception

- [ ] Does the Workspace respond immediately to selection and inspection?
- [ ] Are loading and transition states calm and predictable?
- [ ] Is progressive disclosure used to avoid overwhelming initial presentation?
- [ ] Does the interface avoid unnecessary motion, interruption, or visual noise?

## 21. Demo Readiness

- [ ] Does the 90-second demo tell a compelling Story?
- [ ] Does the demo begin with a meaningful business question or piece of Evidence?
- [ ] Does it demonstrate Permanent Context, investigation, Explain, and a clear outcome?
- [ ] Can the presenter complete the sequence without workarounds or unexplained gaps?
- [ ] Are mocked behavior and assumptions clearly disclosed?

## 22. Production Readiness

- [ ] Has the storyboard been approved?
- [ ] Has the interactive concept been reviewed against this checklist?
- [ ] Are future enhancements clearly separated from Version 1 scope?
- [ ] Are all acceptance criteria satisfied?
- [ ] Are product terminology and financial states consistent with approved governance documents?
- [ ] Are unresolved questions explicitly accepted, deferred, or returned to the storyboard?

## 23. Final Decision

- [ ] The review evidence and remaining revisions are documented.
- [ ] The decision is made by the appropriate product owner.
- [ ] The selected outcome is recorded:

  - [ ] Approved for Production
  - [ ] Approved with Revisions
  - [ ] Return to Storyboard
  - [ ] Reject Concept
