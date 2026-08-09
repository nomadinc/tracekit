import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("semantic design tokens cover product, finding, Evidence, and focus states", () => {
  const css = read("../app/globals.css");
  for (const token of ["background","surface","surface-elevated","surface-subtle","border-color","border-strong","text-primary","text-secondary","text-muted","brand-primary","brand-secondary","brand-accent","brand-primary-hover","brand-primary-subtle","brand-primary-foreground","success","warning","danger","info","observation","correlation","negative-finding","hypothesis","evidence-observed","evidence-propagated","evidence-missing","focus-ring"]) {
    assert.match(css, new RegExp(`--tk-${token}:`));
  }
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});

test("Finding taxonomy remains distinguishable without relying on color alone", () => {
  const primitives = read("../components/ui/tracekit-primitives.tsx");
  for (const label of ["Observation", "Correlation", "Negative finding", "Hypothesis"]) assert.match(primitives, new RegExp(label));
  for (const icon of ["CircleDot", "GitCompare", "CheckCircle2", "Beaker"]) assert.match(primitives, new RegExp(icon));
});

test("Investigation report exposes keyboard-safe canonical section navigation", () => {
  const experience = read("../components/investigations/investigation-experience.tsx");
  const navigator = read("../components/investigations/investigation-section-nav.tsx");
  for (const id of ["executive-finding","evidence-quality","what-happened","concentration","journey","cohort-control","findings","hypotheses","evidence-gaps","methodology"]) assert.match(experience, new RegExp(id));
  assert.match(navigator, /aria-label="Investigation sections"/);
  assert.match(navigator, /aria-current=/);
  assert.match(navigator, /IntersectionObserver/);
  assert.match(navigator, /overflow-x-auto/);
});

test("Investigation workspace owns an intentional dark token scope independent of the light shell", () => {
  const css = read("../app/globals.css");
  const experience = read("../components/investigations/investigation-experience.tsx");
  for (const token of ["dark-background","dark-surface","dark-surface-raised","dark-surface-subtle","dark-border","dark-text-primary","dark-text-secondary","dark-text-muted"]) assert.match(css, new RegExp(`--tk-${token}:`));
  assert.match(css, /\.tk-investigation-workspace[\s\S]*background: var\(--tk-dark-background\)/);
  assert.match(experience, /tk-investigation-workspace/);
  assert.doesNotMatch(experience, /bg-\[var\(--tk-background\)\]/);
});

test("dark report warnings, branch context, and sticky navigation use scoped readable treatments", () => {
  const css = read("../app/globals.css");
  const experience = read("../components/investigations/investigation-experience.tsx");
  const navigator = read("../components/investigations/investigation-section-nav.tsx");
  assert.match(css, /\.tk-investigation-workspace \.tk-warning-panel/);
  assert.match(css, /\.tk-investigation-workspace \.tk-branch-context/);
  assert.match(experience, /tk-warning-panel/);
  assert.match(experience, /tk-branch-context/);
  assert.match(navigator, /--tk-dark-background/);
  assert.match(navigator, /--tk-brand-primary-subtle/);
});

test("brand blue remains distinct from semantic finding colors", () => {
  const css = read("../app/globals.css");
  const primitives = read("../components/ui/tracekit-primitives.tsx");
  assert.match(css, /--tk-brand-primary: #3b82f6/);
  assert.match(primitives, /cyan-400/);
  assert.match(primitives, /violet-400/);
  assert.match(primitives, /emerald-400/);
  assert.match(primitives, /amber-400/);
});

test("brand boundary preserves placeholder until an approved logo asset exists", () => {
  const brand = read("../lib/identity/branding.ts");
  const mark = read("../components/ui/brand-mark.tsx");
  const sidebar = read("../components/layout/production-sidebar.tsx");
  assert.match(brand, /logoMark: "TK"/);
  assert.match(mark, /--tk-brand-primary/);
  assert.match(mark, /assetSrc\?: string/);
  assert.match(mark, /wordmarkAssetSrc\?: string/);
  assert.match(mark, /export function BrandAnchor/);
  assert.match(sidebar, /<BrandAnchor/);
  assert.match(sidebar, /subtitle=\{shellLabel\}/);
  assert.doesNotMatch(mark, /<svg/);
});

test("authenticated shell, Investigations, and Connections consume one canonical brand family", () => {
  const css = read("../app/globals.css");
  const sidebar = read("../components/layout/production-sidebar.tsx");
  const investigation = read("../components/investigations/investigation-experience.tsx");
  const connections = read("../components/connections/integration-experience.tsx");
  assert.match(css, /\.tk-nav-active[\s\S]*var\(--tk-brand-primary\)/);
  assert.match(sidebar, /tk-nav-active/);
  assert.match(investigation, /tk-brand-eyebrow/);
  assert.match(connections, /tk-brand-eyebrow/);
  assert.match(connections, /tk-workspace-tab-active/);
  assert.match(connections, /tk-brand-link/);
});

test("Connection summary is derived from server presentation state", () => {
  const source = read("../components/connections/integration-experience.tsx");
  assert.match(source, /aria-label="Connection summary"/);
  assert.match(source, /connection\.status === "connected"/);
  assert.match(source, /connection\.lastVerifiedAt/);
  assert.doesNotMatch(source, /Math\.random|fakeHealth|demoHealth/);
  assert.match(source, /min-h-full bg-\[#080a0f\]/);
});
