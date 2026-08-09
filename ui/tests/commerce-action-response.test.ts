import test from "node:test";
import assert from "node:assert/strict";
import { readCommerceActionResponse } from "../lib/commerce/action-response";

test("empty 201 and 204 responses never throw", async () => {
  const empty = await readCommerceActionResponse(new Response("", { status: 201 }));
  assert.equal(empty.ok, false);
  assert.equal(empty.ok ? "" : empty.code, "empty_response");
  assert.equal((await readCommerceActionResponse(new Response(null, { status: 204 }))).ok, true);
});

test("HTML errors and malformed JSON become safe errors", async () => {
  const html = await readCommerceActionResponse(new Response("<html>secret stack</html>", { status: 500, headers: { "content-type": "text/html" } }));
  assert.equal(html.ok, false);
  assert.equal(JSON.stringify(html).includes("secret stack"), false);
  const malformed = await readCommerceActionResponse(new Response("{oops", { status: 500, headers: { "content-type": "application/json" } }));
  assert.equal(malformed.ok, false);
});

test("structured success and error envelopes are preserved", async () => {
  const success = await readCommerceActionResponse(new Response(JSON.stringify({ ok: true, connectionId: "connection-1", verified: true, status: "connected" }), { status: 201, headers: { "content-type": "application/json" } }));
  assert.equal(success.ok && success.connectionId, "connection-1");
  const failure = await readCommerceActionResponse(new Response(JSON.stringify({ ok: false, code: "invalid_request", message: "Check the details." }), { status: 400, headers: { "content-type": "application/json" } }));
  assert.equal(failure.ok ? "" : failure.message, "Check the details.");
});
