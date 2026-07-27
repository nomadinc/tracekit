import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildEventExplorerTimeline,
  decodeEventExplorerCursor,
  encodeEventExplorerCursor,
  matchEventExplorerRoute,
  normalizeEventExplorerListParams,
  sortEventExplorerItems,
  summarizeAttributionStatus,
  summarizeCommissionStatus,
} from "./event-explorer.ts";
import {
  eventPipelinePercent,
  eventStatusTone,
  formatEventMoney,
} from "../../ui/lib/event-explorer.ts";

test("event explorer route matching is method-safe and avoids browser ingestion alias", () => {
  assert.deepEqual(matchEventExplorerRoute("GET", "/v1/events"), { kind: "event_list" });
  assert.deepEqual(matchEventExplorerRoute("GET", "/v1/events/browser:abc"), { kind: "event_detail", event_key: "browser:abc" });
  assert.deepEqual(matchEventExplorerRoute("POST", "/v1/events"), {
    kind: "method_not_allowed",
    path: "/v1/events",
    allowed_methods: ["GET"],
  });
  assert.equal(matchEventExplorerRoute("POST", "/v1/events/browser"), null);
});

test("event explorer params preserve workspace isolation filters and bounded limits", () => {
  const params = normalizeEventExplorerListParams({
    workspace_id: " default ",
    limit: "500",
    from: "2026-07-01",
    to: "2026-07-24",
    event_type: "purchase",
    status: "normalized",
    source: "browser_sdk",
    affiliate_id: "affiliate-1",
    person_id: "person-1",
    journey_id: "journey-1",
    origin: "browser",
    needs_review: "true",
    normalized: "1",
    failed: "yes",
    search: " tkid-123 ",
    dir: "asc",
  });
  assert.equal(params.workspace_id, "default");
  assert.equal(params.limit, 100);
  assert.equal(params.from, "2026-07-01T00:00:00.000Z");
  assert.equal(params.to_exclusive, "2026-07-25T00:00:00.000Z");
  assert.equal(params.event_type, "purchase");
  assert.equal(params.status, "normalized");
  assert.equal(params.source, "browser_sdk");
  assert.equal(params.affiliate_id, "affiliate-1");
  assert.equal(params.person_id, "person-1");
  assert.equal(params.journey_id, "journey-1");
  assert.equal(params.origin, "browser");
  assert.equal(params.needs_review, true);
  assert.equal(params.normalized, true);
  assert.equal(params.failed, true);
  assert.equal(params.search, "tkid-123");
  assert.equal(params.dir, "asc");
});

test("event explorer cursors and sorting are deterministic", () => {
  const encoded = encodeEventExplorerCursor({ event_time: "2026-07-24T12:00:00.000Z", id: "b" });
  assert.deepEqual(decodeEventExplorerCursor(encoded), { event_time: "2026-07-24T12:00:00.000Z", id: "b" });
  const rows = sortEventExplorerItems([
    { event_key: "journey:a", event_time: "2026-07-24T12:00:00.000Z" },
    { event_key: "browser:b", event_time: "2026-07-24T12:01:00.000Z" },
  ], "desc");
  assert.deepEqual(rows.map((row) => row.event_key), ["browser:b", "journey:a"]);
});

test("event explorer summarizes attribution commission and pipeline states", () => {
  assert.equal(summarizeAttributionStatus("purchase", null, []), "not_calculated");
  assert.equal(summarizeAttributionStatus("page_view", "affiliate-1", []), "eligible_touchpoint");
  assert.equal(summarizeAttributionStatus("purchase", null, [{ status: "attributed" }]), "attributed");
  assert.equal(summarizeCommissionStatus([]), "not_commissioned");
  assert.equal(summarizeCommissionStatus([{ status: "draft" }, { status: "approved" }]), "approved");

  const timeline = buildEventExplorerTimeline({
    browser: {
      received_at: "2026-07-24T12:00:00.000Z",
      normalized_at: "2026-07-24T12:00:03.000Z",
      person_id: "person-1",
      journey_id: "journey-1",
      updated_at: "2026-07-24T12:00:05.000Z",
    },
    credits: [{ calculated_at: "2026-07-24T12:00:08.000Z" }],
    commissions: [{ generated_at: "2026-07-24T12:00:09.000Z" }],
  });
  assert.equal(timeline.length, 6);
  assert.equal(timeline[0].name, "Received");
  assert.equal(timeline.at(-1)?.name, "Commission");
  assert.equal(eventPipelinePercent(timeline), 100);
});

test("event explorer UI helpers render status tones and money consistently", () => {
  assert.equal(eventStatusTone("normalized"), "good");
  assert.equal(eventStatusTone("pending"), "warn");
  assert.equal(eventStatusTone("error"), "bad");
  assert.equal(formatEventMoney("99.00", "USD"), "$99.00");
});

test("event explorer source uses existing backend surfaces and keeps admin secret server-side", () => {
  const worker = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const apiRoute = readFileSync(new URL("../../ui/app/api/events/route.ts", import.meta.url), "utf8");
  const detailRoute = readFileSync(new URL("../../ui/app/api/events/[...eventKey]/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../../ui/app/(app)/events/events-explorer-client.tsx", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../../supabase/migrations/026_event_explorer_indexes.sql", import.meta.url), "utf8");

  assert.match(worker, /matchEventExplorerRoute/);
  assert.match(worker, /adminAuthError\(req, env\)/);
  assert.match(apiRoute, /\/v1\/events/);
  assert.match(apiRoute, /"x-tk-secret": secret/);
  assert.match(detailRoute, /encodeURIComponent\(eventKey\)/);
  assert.doesNotMatch(page, /TK_SECRET_KEY|x-tk-secret|TRACEKIT_TK_SECRET/);
  assert.match(page, /EventDetailDrawer/);
  assert.match(page, /Raw Payload/);
  assert.match(page, /Processing Timeline/);
  assert.match(page, /No events found/);
  assert.match(migration, /browser_events_raw_explorer_status_time_idx/);
  assert.match(migration, /journey_events_explorer_affiliate_time_idx/);
  assert.doesNotMatch(migration.toLowerCase(), /drop table|truncate table|delete from|update public/);
});
