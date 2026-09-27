import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  resolveEligibleTkidPreflightOrigin,
  tkidBrowserPreflightRoute,
  tkidCorsHeaders,
  tkidPreflightRequestAllowed,
  tkidPreflightResponseHeaders,
} from "./tkid-browser-cors.ts";

type Row = Record<string, unknown>;

class Query implements PromiseLike<{ data: Row[]; error: null }> {
  private filters: Array<(row: Row) => boolean> = [];
  private rows: Row[];
  constructor(rows: Row[]) { this.rows = rows; }
  select() { return this; }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const data = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    return Promise.resolve({ data, error: null }).then(onfulfilled, onrejected);
  }
}

function database(origins: Row[], sources: Row[]) {
  return {
    from(table: string) {
      return new Query(table === "tkid_source_origins" ? origins : sources);
    },
  };
}

const eligibleOrigin = {
  organization_id: "org-a",
  source_id: "source-a",
  canonical_origin: "https://shop.example.com",
  lifecycle_status: "active",
  verification_state: "verified",
  role: "frontend",
};
const eligibleSource = { id: "source-a", organization_id: "org-a", status: "shadow" };

test("standards-compliant bootstrap and events preflights need no actual custom-header values", () => {
  const bootstrap = tkidBrowserPreflightRoute("/v1/tkid/bootstrap");
  const events = tkidBrowserPreflightRoute("/v1/tkid/events");
  assert.ok(bootstrap);
  assert.ok(events);
  assert.equal(tkidPreflightRequestAllowed(bootstrap, "POST", "x-tracekit-bootstrap-key,x-tracekit-source"), true);
  assert.equal(tkidPreflightRequestAllowed(events, "POST", "content-type,x-tracekit-source"), true);
  assert.equal(tkidPreflightRequestAllowed(bootstrap, "GET", "x-tracekit-source"), false);
  assert.equal(tkidPreflightRequestAllowed(events, "POST", "x-tracekit-source,x-unreviewed"), false);
});

test("only enumerated browser routes receive preflight contracts", () => {
  assert.ok(tkidBrowserPreflightRoute("/v1/tkid/bootstrap"));
  assert.ok(tkidBrowserPreflightRoute("/v1/tkid/events"));
  assert.ok(tkidBrowserPreflightRoute("/v1/tkid/handoff"));
  assert.equal(tkidBrowserPreflightRoute("/v1/tkid/checkout-association"), null);
  assert.equal(tkidBrowserPreflightRoute("/v1/tkid/unknown"), null);
});

test("eligible preflight returns exact ACAO and never wildcard or credentials", () => {
  const route = tkidBrowserPreflightRoute("/v1/tkid/bootstrap");
  assert.ok(route);
  const headers = tkidPreflightResponseHeaders(route, "https://shop.example.com");
  assert.equal(headers["access-control-allow-origin"], "https://shop.example.com");
  assert.equal(headers.vary, "Origin");
  assert.equal("access-control-allow-credentials" in headers, false);
  assert.doesNotMatch(JSON.stringify(headers), /\*/);
  const denied = tkidPreflightResponseHeaders(route, null);
  assert.equal("access-control-allow-origin" in denied, false);
});

test("origin-only eligibility accepts at least one candidate without selecting a source", async () => {
  const ambiguous = [eligibleOrigin, { ...eligibleOrigin, organization_id: "org-b", source_id: "source-b" }];
  const sources = [eligibleSource, { id: "source-b", organization_id: "org-b", status: "active" }];
  assert.equal(
    await resolveEligibleTkidPreflightOrigin(database(ambiguous, sources), "https://SHOP.example.com:443"),
    "https://shop.example.com",
  );
});

test("preflight eligibility fails closed for origin and source ineligibility", async () => {
  const cases: Array<[string, Row[], Row[]]> = [
    ["unknown", [], [eligibleSource]],
    ["pending", [{ ...eligibleOrigin, lifecycle_status: "pending" }], [eligibleSource]],
    ["unverified", [{ ...eligibleOrigin, verification_state: "issued" }], [eligibleSource]],
    ["retired", [{ ...eligibleOrigin, lifecycle_status: "retired" }], [eligibleSource]],
    ["non-frontend", [{ ...eligibleOrigin, role: "checkout_return" }], [eligibleSource]],
    ["disabled-source", [eligibleOrigin], [{ ...eligibleSource, status: "disabled" }]],
    ["cross-organization", [eligibleOrigin], [{ ...eligibleSource, organization_id: "org-other" }]],
  ];
  for (const [label, origins, sources] of cases) {
    assert.equal(
      await resolveEligibleTkidPreflightOrigin(database(origins, sources), "https://shop.example.com"),
      null,
      label,
    );
  }
});

test("malformed and unsafe Production origins remain denied", async () => {
  const db = database([eligibleOrigin], [eligibleSource]);
  for (const origin of [
    "http://shop.example.com",
    "https://shop.example.com/path",
    "https://shop.example.com?query=1",
    "https://shop.example.com#fragment",
    "not-an-origin",
  ]) assert.equal(await resolveEligibleTkidPreflightOrigin(db, origin), null, origin);
});

test("POST authorization remains source-bound and trusted responses use exact-origin CORS", () => {
  const worker = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const resolver = worker.slice(worker.indexOf("async function resolveActiveTkidOrigin"), worker.indexOf("async function claimTkidProof"));
  assert.match(resolver, /public_source_id.*publicSourceId/);
  assert.match(resolver, /source_id.*source\.id/);
  assert.match(resolver, /canonical_origin.*canonicalOrigin/);
  assert.match(resolver, /lifecycle_status.*active/);
  assert.match(worker, /proofFailure\(String\(claimed\.decision\),trustedOrigin\)/);
  assert.match(worker, /proofFailure\(preflight,trustedOrigin\)/);
  assert.match(worker, /trustedOrigin\?tkidCorsHeaders\(trustedOrigin\):undefined/);
  assert.match(worker, /\.\.\.\(trustedOrigin\?tkidCorsHeaders\(trustedOrigin\):\{\}\)/);
  assert.match(worker, /\.\.\.tkidCorsHeaders\(normalizedOrigin\)/);
  assert.doesNotMatch(JSON.stringify(tkidCorsHeaders("https://shop.example.com")), /\*/);
});

test("stopped proof rejection remains before persistence and becomes browser-readable", () => {
  const worker = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const ingest = worker.slice(worker.indexOf('if (tkidRoute === "ingest")'), worker.indexOf("const browserRoute"));
  const gate = ingest.indexOf("proofPreflightDecision");
  const failure = ingest.indexOf("proofFailure(preflight,trustedOrigin)");
  const journey = ingest.indexOf('from("tkid_journeys")');
  const event = ingest.indexOf('from("tkid_events")');
  assert.ok(gate >= 0 && failure > gate && journey > failure && event > failure);
});
