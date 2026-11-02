import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { build } = require("esbuild");
const { JSDOM } = require("jsdom");
const React = require("react");
const { act } = React;

const rootDir = resolve(import.meta.dirname, "../..");
const temporary = await mkdtemp(join(rootDir, ".ws023-mounted-"));

const fixture = {
  ok: true,
  products: [{
    providerProductId: "PRODUCT-001",
    title: "Test Product",
    mappingStatus: "unmapped",
    mappingVersion: "v1",
    businessContextId: "business-A",
    canonicalOfferId: "offer-A",
    offerStepId: "step-A",
    offerVariantId: null,
    integrityStatus: "ok",
    orderCount: 2,
    grossRevenue: 100,
    refundCount: 0,
    refundAmount: 0,
    observedPrices: [50],
    firstSeenAt: "2026-11-01T00:00:00Z",
    lastSeenAt: "2026-11-01T00:00:00Z",
    alertOpen: false,
    workItemOpen: false,
    recommendation: {
      ruleId: "rule-A",
      confidence: 95,
      disposition: "bulk_review",
      businessContextId: "business-A",
      canonicalOfferId: "offer-A",
      offerStepId: "step-A",
      offerVariantId: null,
      evidence: {
        identityMatch: "provider_product_id",
        scope: "organization",
        priceMatches: [50],
        priceEvidenceWeight: 1
      }
    },
    authorizedPreset: null
  }],
  targets: {
    contexts: [],
    offers: [],
    steps: [{ id: "step-A", label: "Test Offer" }],
    variants: []
  },
  history: []
};

const session = {
  authenticated: true,
  developmentOnly: false,
  activeOrganizationId: "org-A",
  activeBusinessContextId: "business-A",
  identity: {
    id: "operator-A",
    membership: {
      id: "membership-A",
      accountType: "client",
      role: "organization-owner",
      organizationIds: ["org-A"],
      grants: [],
      denials: []
    }
  }
};

const plugin = {
  name: "ws023-mocks",
  setup(b) {
    b.onResolve({ filter: /^next\/navigation$/ }, () => ({
      path: "navigation",
      namespace: "ws023"
    }));
    b.onResolve({ filter: /components\/identity\/identity-provider$/ }, () => ({
      path: "identity",
      namespace: "ws023"
    }));
    b.onResolve({ filter: /components\/identity\/access-control$/ }, () => ({
      path: "access",
      namespace: "ws023"
    }));
    b.onLoad({ filter: /.*/, namespace: "ws023" }, ({ path }) => ({
      loader: path === "access" ? "jsx" : "js",
      contents: path === "navigation"
        ? 'export const usePathname = () => "/offers";'
        : path === "identity"
          ? `export const useIdentity = () => ({session:${JSON.stringify(session)}});`
          : 'export const AccessBoundary = ({children}) => children;'
    }));
  }
};

try {
  const entry = join(temporary, "entry.jsx");
  const output = join(temporary, "bundle.mjs");

  await writeFile(entry, `
    import React from "react";
    import { CommerceProductMappingReview } from
      "${join(rootDir, "components/offers/commerce-product-mapping-review.tsx")}";
    import { ShellDrawerProvider } from
      "${join(rootDir, "components/layout/shell-drawer.tsx")}";

    export function App() {
      return (
        <ShellDrawerProvider>
          <CommerceProductMappingReview />
        </ShellDrawerProvider>
      );
    }
  `);

  await build({
    entryPoints: [entry],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    jsx: "automatic",
    alias: { "@": rootDir },
    plugins: [plugin]
  });

  const dom = new JSDOM(
    "<!doctype html><html><body><div id='root'></div></body></html>",
    { url: "http://localhost/offers" }
  );

  for (const key of [
    "window", "document", "navigator", "HTMLElement",
    "Element", "Node", "MouseEvent", "Event"
  ]) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: dom.window[key]
    });
  }

  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = async () => ({
    ok: true,
    headers: { get: () => null },
    json: async () => fixture
  });

  const { App } = await import(pathToFileURL(output).href);
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));

  try {
    await act(async () => root.render(React.createElement(App)));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const buttons = () => [...document.querySelectorAll("button")];

    const review = buttons().find((button) =>
      button.textContent.includes("Review group")
    );
    assert.ok(review, "Review group button must exist");

    await act(async () => review.click());

    assert.ok(
      document.querySelector('[role="dialog"]'),
      "Bulk mapping drawer must open"
    );

    const close = [
      ...document.querySelectorAll('[role="dialog"] button')
    ].find((button) => button.textContent.trim() === "Close");

    assert.ok(close, "Bulk drawer Close button must exist");

    await act(async () => close.click());

    assert.equal(
      document.querySelector('[role="dialog"]'),
      null,
      "Close must dismiss the actual Offers drawer"
    );

    console.log("ACTUAL_OFFERS_MOUNTED_CLOSE=PASS");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
