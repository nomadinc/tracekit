import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SETUP_WIZARD_STEPS,
  compactWorkspaceOnboarding,
  matchSetupWizardRoute,
  normalizeSetupProgressRequest,
  normalizeWorkspaceSetupRequest,
} from "./setup-wizard.ts";
import {
  eventOccurredAfter,
  formatAllowedOrigins,
  mergeCompletedSteps,
  parseAllowedOrigins,
  setupProgressPercent,
} from "../../ui/lib/setup-wizard.ts";

test("setup wizard route matching is deterministic and method-safe", () => {
  assert.deepEqual(matchSetupWizardRoute("GET", "/v1/setup-wizard"), { kind: "get_setup" });
  assert.deepEqual(matchSetupWizardRoute("POST", "/v1/setup-wizard/workspace"), { kind: "save_workspace" });
  assert.deepEqual(matchSetupWizardRoute("POST", "/v1/setup-wizard/progress/"), { kind: "save_progress" });
  assert.deepEqual(matchSetupWizardRoute("DELETE", "/v1/setup-wizard"), {
    kind: "method_not_allowed",
    path: "/v1/setup-wizard",
    allowed_methods: ["GET"],
  });
  assert.equal(matchSetupWizardRoute("GET", "/v1/not-setup-wizard"), null);
});

test("workspace setup request normalizes workspace metadata without creating a second model", () => {
  const parsed = normalizeWorkspaceSetupRequest({
    workspace_id: " default ",
    workspace_name: " Eco Watt ",
    primary_website_url: "buyecowatt.com/path",
    default_timezone: "America/Los_Angeles",
    default_currency: "usd",
    completed_steps: ["workspace", "workspace", "invalid"],
  });
  assert.equal(parsed.workspace_id, "default");
  assert.equal(parsed.workspace_name, "Eco Watt");
  assert.equal(parsed.primary_website_url, "https://buyecowatt.com");
  assert.equal(parsed.default_timezone, "America/Los_Angeles");
  assert.equal(parsed.default_currency, "USD");
  assert.deepEqual(parsed.completed_steps, ["workspace"]);
});

test("setup progress resumes incomplete state and completion is explicit", () => {
  const compact = compactWorkspaceOnboarding({
    workspace_id: "default",
    workspace_name: "TraceKit",
    current_step: "attribution",
    completed_steps: ["workspace", "browser_tracking", "test_installation"],
    dismissed_warnings: ["rotate_write_key"],
    completed_at: null,
  } as any);
  assert.equal(compact.current_step, "attribution");
  assert.deepEqual(compact.completed_steps, ["workspace", "browser_tracking", "test_installation"]);
  assert.deepEqual(compact.dismissed_warnings, ["rotate_write_key"]);
  assert.equal(compact.completed_at, null);

  const progress = normalizeSetupProgressRequest({
    workspace_id: "default",
    current_step: "completion",
    completed_steps: SETUP_WIZARD_STEPS,
    dismissed_warnings: ["browser_write_key_rotation"],
    mark_completed: true,
  });
  assert.equal(progress.current_step, "completion");
  assert.equal(progress.completed_steps.length, SETUP_WIZARD_STEPS.length);
  assert.deepEqual(progress.dismissed_warnings, ["browser_write_key_rotation"]);
  assert.match(String(progress.completed_at), /^\d{4}-\d{2}-\d{2}T/);
});

test("setup wizard UI helpers parse origins progress and real event timing", () => {
  assert.deepEqual(parseAllowedOrigins("https://a.test\nhttps://b.test, https://a.test"), ["https://a.test", "https://b.test"]);
  assert.equal(formatAllowedOrigins(["https://a.test", "", "https://b.test"]), "https://a.test\nhttps://b.test");
  assert.equal(setupProgressPercent(["workspace", "browser_tracking", "unknown"]), 33);
  assert.deepEqual(mergeCompletedSteps(["workspace"], "browser_tracking"), ["workspace", "browser_tracking"]);
  assert.equal(eventOccurredAfter({ received_at: "2026-07-24T12:01:00.000Z" }, "2026-07-24T12:00:00.000Z"), true);
  assert.equal(eventOccurredAfter({ received_at: "2026-07-24T11:59:00.000Z" }, "2026-07-24T12:00:00.000Z"), false);
});

test("migration adds only workspace-scoped onboarding state", () => {
  const migration = readFileSync(new URL("../../supabase/migrations/025_workspace_onboarding_setup_wizard.sql", import.meta.url), "utf8");
  assert.match(migration, /create table if not exists public\.workspace_onboarding/);
  assert.match(migration, /workspace_id text primary key/);
  assert.match(migration, /current_step text not null default 'workspace'/);
  assert.match(migration, /completed_steps text\[\] not null default/);
  assert.match(migration, /dismissed_warnings text\[\] not null default/);
  assert.match(migration, /completed_at timestamptz/);
  assert.match(migration, /workspace_onboarding_current_step_check/);
  assert.doesNotMatch(migration.toLowerCase(), /drop table|truncate table|rename to/);
});

test("setup wizard UI proxy keeps admin secret server-side and reuses existing APIs", () => {
  const proxy = readFileSync(new URL("../../ui/app/api/setup-wizard/route.ts", import.meta.url), "utf8");
  const page = readFileSync(new URL("../../ui/app/(app)/setup/setup-wizard-client.tsx", import.meta.url), "utf8");
  assert.match(proxy, /headers\.set\("x-tk-secret", secret\)/);
  assert.match(proxy, /\/v1\/browser\/setup\?workspace_id=/);
  assert.match(proxy, /\/v1\/browser\/config/);
  assert.match(proxy, /\/v1\/payouts\/attribution-policy/);
  assert.match(proxy, /\/v1\/payouts\/affiliate-commissions\/generate/);
  assert.match(proxy, /dry_run: true/);
  assert.match(proxy, /Setup services are temporarily unavailable/);
  assert.doesNotMatch(page, /TK_SECRET_KEY|x-tk-secret|NEXT_PUBLIC_TK_SECRET_KEY/);
  assert.match(page, /Tell TraceKit about your company/i);
  assert.match(page, /Install the TraceKit tracking script/i);
  assert.match(page, /Websites to Track/);
  assert.match(page, /Tracking Key/);
  assert.match(page, /Write Key is the technical name/);
  assert.match(page, /Verify Tracking/);
  assert.match(page, /Choose Attribution Model/);
  assert.match(page, /Default Commission Percentage/);
  assert.match(page, /Preview Commission Generation/);
  assert.match(page, /Your TraceKit workspace is ready/i);
  assert.match(page, /shows the key only once/i);
  assert.match(page, /Dismiss warning/);
  assert.match(page, /Start verification/);
});
