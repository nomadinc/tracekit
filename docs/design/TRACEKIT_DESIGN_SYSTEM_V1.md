# TraceKit Design System V1

## Product character

TraceKit is a calm, evidence-oriented intelligence operating system. Dense information is welcome when it helps an operator make a decision. Decoration, unsupported certainty, rainbow analytics, and chat-first presentation are not.

The Phase 2 Connections and Investigation experiences are the reference surfaces. Adoption should preserve their hierarchy rather than restyle them wholesale.

## Brand assets

An approved brand reference sheet establishes the near-black foundation, white wordmark, electric-blue-to-deep-cobalt identity treatment, cool-gray secondary typography, `TK` application mark, Arrow favicon, full TraceKit wordmark, and the tagline **TRACK. RECONCILE. TRUST.** It is a visual reference, not a production asset.

No final production TraceKit SVG, PNG, wordmark, or favicon asset is present in the repository. The `TK` text mark remains the temporary shell anchor. `BrandAnchor` owns the mark, wordmark/name, and role-aware account subtitle; `BrandMark` accepts a future image asset and `BrandAnchor` accepts a future wordmark asset. Approved production artwork can therefore replace the placeholders without changing shell layout. The reference sheet must not be traced into substitute artwork. **FINAL LOGO ASSETS REQUIRED.**

Electric blue and deep cobalt are the semantic brand treatments for identity, primary actions, selected navigation, links, focus, and occasional key emphasis. Gradients are reserved for the compact identity mark. Brand accents never replace semantic success, warning, danger, Investigation taxonomy, or Evidence-state colors.

## Semantic tokens

Tokens live in `ui/app/globals.css` and cover background, surface levels, borders, primary/secondary/muted text, brand and accent, success/warning/danger/info, finding taxonomy, Evidence states, focus, card radius, and page width. Components should consume semantic variables or the shared primitives rather than introduce new brand hex values.

## Typography and spacing

- Page titles: compact, high-contrast, tight tracking.
- Section titles: 18px, semibold.
- Structural labels/status: 10px, semibold uppercase with restrained tracking.
- Body: 14px; supporting and evidence detail: 12px with generous line height.
- Metrics: tabular numerals, contextual label and denominator where available.
- Monospace is reserved for identifiers and code.
- Page width is capped at 1440px with 16/24/32px responsive gutters.
- Report sections use a compact explanatory rail and a flexible evidence column.

## Surfaces and primitives

- `StatusChip`: label plus semantic tone; color is never the sole signal.
- `MetricSurface`: value, label, context, and optional warning.
- `FindingFrame`: Observation, Correlation, Negative finding, or Hypothesis with text label and icon.
- `BrandMark`: replaceable shell identity boundary.
- Existing shared empty/error/loading states remain preferred outside the dark report surfaces.

Cards use subtle borders and restrained elevation. Tables use aligned numeric values and controlled horizontal scrolling at narrow widths. Dialogs retain visible labels, non-echoing secret inputs, stable error regions, and accessible focus.

## Semantic language

- **Observation:** directly measured state.
- **Correlation:** associated movement that is not causation.
- **Negative finding:** a tested explanation that current evidence does not support.
- **Hypothesis:** a plausible explanation requiring more evidence.
- **Observed Evidence:** directly present in a source.
- **Propagated Evidence:** applied through an approved, versioned Journey rule.
- **Missing Evidence:** intentionally unavailable, not a broken state or failed attribution.

Operational labels use one vocabulary: Connected, Degraded, Verifying, Shadow, Live Beta, Live, Ready, Limited, Embedded, Webhook Only, Unavailable, Running, Completed, Completed with warnings, Failed, Needs Review, and Unmatched.

## Accessibility and motion

Normal text targets WCAG AA contrast. Focus uses the semantic focus-ring token with a two-pixel visible outline and offset. Status and finding meaning always includes text and, for findings, an icon. Reduced-motion preferences disable smooth scrolling and collapse transitions/animations. Keyboard users can navigate the Investigation section rail and native disclosures.

## Responsive behavior

Desktop is primary. The shell becomes drawer navigation below the desktop breakpoint. Investigation section navigation scrolls horizontally without obscuring report content. Journey diagrams and dense tables retain controlled horizontal scrolling. Dialogs remain viewport-contained. Empty, warning, authorization, and failure states explain the state rather than rendering an empty chart.

## Content standard

Prefer “current evidence supports,” “associated with,” “does not appear materially different,” and “needs more evidence.” Avoid causal or accusatory language unless the evidence establishes it. Every Investigation preserves Journey analysis, appropriate controls, negative findings, uncertainty, and safe methodology/provenance.
