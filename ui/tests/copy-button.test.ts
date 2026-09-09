import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CopyButton, writeTextToClipboard } from "../components/shared/primitives.tsx";

test("native clipboard receives the exact bounded value", async () => {
  const writes: string[] = [];
  const value = `fbclid-${"x".repeat(240)}`;
  assert.equal(await writeTextToClipboard(value, { clipboard: { writeText: async (text) => { writes.push(text); } }, document: null }), true);
  assert.deepEqual(writes, [value]);
});

test("a rejected Clipboard API falls back to the user-gesture copy path", async () => {
  const calls: string[] = [];
  const textarea = {
    value: "",
    style: {} as Record<string, string>,
    setAttribute() {},
    focus() { calls.push("focus"); },
    select() { calls.push("select"); },
    remove() { calls.push("remove"); },
  };
  const document = {
    body: { appendChild() { calls.push(`append:${textarea.value}`); } },
    createElement() { return textarea; },
    execCommand(command: string) { calls.push(command); return command === "copy"; },
  };
  const result = await writeTextToClipboard("meta-first", {
    clipboard: { writeText: async () => { throw new Error("NotAllowedError"); } },
    document: document as never,
  });
  assert.equal(result, true);
  assert.deepEqual(calls, ["append:meta-first", "focus", "select", "copy", "remove"]);
});

test("clipboard failure is returned instead of reporting false success", async () => {
  assert.equal(await writeTextToClipboard("value", {
    clipboard: { writeText: async () => { throw new Error("denied"); } },
    document: null,
  }), false);
});

test("CopyButton remains a keyboard-native button with accessible feedback", () => {
  const html = renderToStaticMarkup(createElement(CopyButton, { value: "safe-value", label: "Copy first value" }));
  assert.match(html, /type="button"/);
  assert.match(html, /aria-label="Copy first value"/);
  assert.match(html, /aria-live="polite"/);
});

test("evidence copy controls pass only first and latest bounded values", () => {
  const source = readFileSync(new URL("../app/(app)/customers/[person_id]/journey-attribution-evidence.tsx", import.meta.url), "utf8");
  assert.match(source, /<CopyButton value=\{identifier\.first_value\} label="Copy first value" \/>/);
  assert.match(source, /<CopyButton value=\{identifier\.latest_value\} label="Copy latest value" \/>/);
  assert.doesNotMatch(source, /<CopyButton[^>]+(?:raw_payload|external_customer_id|metadata|evidence)/);
});

test("existing shared CopyButton consumers retain the value and label contract", () => {
  const source = readFileSync(new URL("../components/shared/entity-header.tsx", import.meta.url), "utf8");
  assert.match(source, /<CopyButton value=\{identifier\.value\} label="Copy" \/>/);
  assert.match(source, /<CopyButton key=\{action\.id\} value=\{action\.value\} label=\{action\.label\} \/>/);
});
