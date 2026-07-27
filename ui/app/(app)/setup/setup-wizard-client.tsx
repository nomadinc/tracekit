"use client";

import * as React from "react";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clipboard,
  CreditCard,
  DollarSign,
  ExternalLink,
  Globe2,
  KeyRound,
  Loader2,
  MousePointerClick,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import {
  SETUP_WIZARD_STEP_LABELS,
  SETUP_WIZARD_STEPS,
  eventOccurredAfter,
  formatAllowedOrigins,
  latestEventSummary,
  mergeCompletedSteps,
  normalizeSetupStep,
  parseAllowedOrigins,
  setupProgressPercent,
  setupStepIndex,
  type SetupWizardStep,
} from "@/lib/setup-wizard";

type Snapshot = {
  ok: boolean;
  workspace_id: string;
  onboarding: any;
  browser: any;
  attribution_policy: any;
  payout_validation: any;
  latest_draft_commissions: any[];
  diagnostics?: {
    admin_proxy_configured?: boolean;
    failed_sections?: Array<{ section: string; status: number; error: string; message?: string | null }>;
  };
};

const MODEL_OPTIONS = [
  { value: "first_touch", label: "First Touch", winner: "Google receives credit.", path: ["Google", "Facebook", "Purchase"] },
  { value: "last_touch", label: "Last Touch", winner: "Facebook receives credit.", path: ["Google", "Facebook", "Purchase"] },
  { value: "linear", label: "Linear", winner: "Google and Facebook share credit.", path: ["Google", "Facebook", "Purchase"] },
  { value: "position_based", label: "Position Based", winner: "First and last touchpoints receive the most credit.", path: ["Google", "Facebook", "Purchase"] },
];

const TIMEZONE_OPTIONS = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"];
const CURRENCY_OPTIONS = ["USD", "CAD", "EUR", "GBP", "AUD"];

async function readJsonSafe(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, error: "invalid_json", message: text.slice(0, 240) };
  }
}

async function setupRequest(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(init?.headers || {}),
    },
  });
  const body = await readJsonSafe(res);
  if (!res.ok) throw new Error(body?.message || body?.error || `Request failed (${res.status})`);
  return body;
}

function stepAfter(step: SetupWizardStep): SetupWizardStep {
  return SETUP_WIZARD_STEPS[Math.min(SETUP_WIZARD_STEPS.length - 1, setupStepIndex(step) + 1)];
}

function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad" }) {
  const cls = {
    neutral: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200",
    good: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
    warn: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
    bad: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200",
  }[tone];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>{children}</span>;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span> : null}
    </label>
  );
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-white/5"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }}
    >
      <Clipboard className="h-4 w-4" />
      {copied ? "Copied!" : label}
    </button>
  );
}

function formatCommissionPercentage(value: unknown) {
  const raw = Number(value ?? 0);
  const percent = Number.isFinite(raw) ? raw * 100 : 0;
  return `${Number.isInteger(percent) ? percent.toFixed(0) : percent.toFixed(2)}%`;
}

function IntroCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-slate-50 p-4 dark:bg-white/5">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-white p-2 text-slate-700 shadow-sm dark:bg-black/20 dark:text-slate-100">{icon}</div>
        <div>
          <div className="font-semibold">{title}</div>
          <div className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{children}</div>
        </div>
      </div>
    </div>
  );
}

function PrimaryButton({ children, disabled, onClick, icon }: { children: React.ReactNode; disabled?: boolean; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
    >
      {icon}
      {children}
    </button>
  );
}

export default function SetupWizardClient() {
  const workspaceId = "default";
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
  const [activeStep, setActiveStep] = React.useState<SetupWizardStep>("workspace");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [lastWriteKey, setLastWriteKey] = React.useState<string | null>(null);
  const [testStartedAt, setTestStartedAt] = React.useState<string | null>(null);
  const [polling, setPolling] = React.useState(false);
  const [validationResult, setValidationResult] = React.useState<any | null>(null);

  const onboarding = snapshot?.onboarding || {};
  const completedSteps = Array.isArray(onboarding.completed_steps) ? onboarding.completed_steps : [];
  const completed = new Set(completedSteps);
  const dismissedWarnings = Array.isArray(onboarding.dismissed_warnings) ? onboarding.dismissed_warnings : [];
  const dismissedWarningSet = new Set(dismissedWarnings);
  const progress = setupProgressPercent(completedSteps);
  const browser = snapshot?.browser || {};
  const policy = snapshot?.attribution_policy || {};
  const latestReceived = latestEventSummary(browser.last_event_received);
  const latestNormalized = latestEventSummary(browser.last_event_normalized);
  const receivedAfterTest = eventOccurredAfter(browser.last_event_received, testStartedAt);
  const normalizedAfterTest = eventOccurredAfter(browser.last_event_normalized, testStartedAt);

  const [workspaceName, setWorkspaceName] = React.useState("");
  const [websiteUrl, setWebsiteUrl] = React.useState("");
  const [timezone, setTimezone] = React.useState("UTC");
  const [currency, setCurrency] = React.useState("USD");
  const [allowedOrigins, setAllowedOrigins] = React.useState("");
  const [rateLimit, setRateLimit] = React.useState("120");
  const [activeModel, setActiveModel] = React.useState("first_touch");
  const [modelVersion, setModelVersion] = React.useState("v1");
  const [commissionRate, setCommissionRate] = React.useState("0");

  async function load(options: { quiet?: boolean } = {}) {
    if (!options.quiet) setLoading(true);
    setError(null);
    try {
      const data = await setupRequest(`/api/setup-wizard?workspace_id=${encodeURIComponent(workspaceId)}`);
      setSnapshot(data);
      const nextOnboarding = data.onboarding || {};
      setActiveStep(normalizeSetupStep(nextOnboarding.current_step));
      setWorkspaceName(nextOnboarding.workspace_name || "Default Workspace");
      setWebsiteUrl(nextOnboarding.primary_website_url || "");
      setTimezone(nextOnboarding.default_timezone || "UTC");
      setCurrency(nextOnboarding.default_currency || "USD");
      setAllowedOrigins(formatAllowedOrigins(data.browser?.allowed_origins || []));
      setRateLimit(String(data.browser?.rate_limit_per_minute || 120));
      setActiveModel(data.attribution_policy?.active_model || "first_touch");
      setModelVersion(data.attribution_policy?.model_version || "v1");
      setCommissionRate(String(data.attribution_policy?.default_commission_rate ?? 0));
    } catch (err: any) {
      setError(err?.message || "Setup snapshot failed.");
    } finally {
      if (!options.quiet) setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
  }, []);

  React.useEffect(() => {
    if (!polling) return;
    const id = window.setInterval(() => load({ quiet: true }), 5000);
    return () => window.clearInterval(id);
  }, [polling]);

  React.useEffect(() => {
    if (polling && receivedAfterTest && normalizedAfterTest) {
      setPolling(false);
      markStepCompleteRef.current("test_installation", "attribution").catch(() => {});
    }
  }, [polling, receivedAfterTest, normalizedAfterTest]);

  async function postAction(body: Record<string, any>) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const data = await setupRequest("/api/setup-wizard", {
        method: "POST",
        body: JSON.stringify({ workspace_id: workspaceId, ...body }),
      });
      if (data.snapshot) setSnapshot(data.snapshot);
      return data;
    } catch (err: any) {
      setError(err?.message || "Action failed.");
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function markStepComplete(step: SetupWizardStep, nextStep = stepAfter(step)) {
    const nextCompleted = mergeCompletedSteps(completedSteps, step);
    await postAction({
      action: "save_progress",
      current_step: nextStep,
      completed_steps: nextCompleted,
      dismissed_warnings: dismissedWarnings,
    });
    setActiveStep(nextStep);
  }

  const markStepCompleteRef = React.useRef(markStepComplete);
  React.useEffect(() => {
    markStepCompleteRef.current = markStepComplete;
  });

  async function saveWorkspace() {
    await postAction({
      action: "save_workspace",
      workspace_name: workspaceName,
      primary_website_url: websiteUrl,
      default_timezone: timezone,
      default_currency: currency,
      current_step: "browser_tracking",
      completed_steps: mergeCompletedSteps(completedSteps, "workspace"),
    });
    setMessage("Company setup saved.");
    setActiveStep("browser_tracking");
  }

  async function configureBrowser() {
    const data = await postAction({
      action: "configure_browser",
      allowed_origins: parseAllowedOrigins(allowedOrigins),
      rate_limit_per_minute: Number(rateLimit || 120),
    });
    const writeKey = data.result?.write_key;
    if (writeKey) setLastWriteKey(writeKey);
    setMessage(writeKey ? "Tracking key generated. Copy it now; TraceKit will not show it again." : "Tracking settings saved.");
    await markStepComplete("browser_tracking", "test_installation");
  }

  async function savePolicy() {
    await postAction({
      action: "save_policy",
      active_model: activeModel,
      model_version: modelVersion,
      default_commission_rate: Number(commissionRate || 0),
    });
    setMessage("Attribution model saved.");
    await markStepComplete("attribution", "payout_validation");
  }

  async function runPayoutValidation() {
    const data = await postAction({ action: "run_payout_validation" });
    setValidationResult(data.result);
    setMessage("Commission preview completed. No payable commissions were created.");
    await markStepComplete("payout_validation", "completion");
  }

  async function completeSetup() {
    await postAction({
      action: "save_progress",
      current_step: "completion",
      completed_steps: SETUP_WIZARD_STEPS,
      mark_completed: true,
    });
    setMessage("Setup marked complete.");
  }

  async function goToStep(step: SetupWizardStep) {
    setActiveStep(step);
    await postAction({
      action: "save_progress",
      current_step: step,
      completed_steps: completedSteps,
      dismissed_warnings: dismissedWarnings,
    }).catch(() => {});
  }

  async function dismissWarning(warningId: string) {
    await postAction({
      action: "save_progress",
      current_step: activeStep,
      completed_steps: completedSteps,
      dismissed_warnings: Array.from(new Set([...dismissedWarnings, warningId])),
    });
  }

  function startInstallationTest() {
    setTestStartedAt(new Date().toISOString());
    setPolling(true);
    setMessage("Waiting for the next browser event from your website.");
  }

  if (loading) {
    return (
      <div className="flex min-h-[28rem] items-center justify-center">
        <div className="flex items-center gap-3 rounded-lg border bg-white px-4 py-3 text-sm shadow-sm dark:bg-ink/80">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading setup wizard
        </div>
      </div>
    );
  }

  const installSnippet = browser.install_snippet || "";
  const failedSections = snapshot?.diagnostics?.failed_sections || [];

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="rounded-lg border bg-white p-5 shadow-sm dark:bg-ink/80">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">TraceKit Setup</h1>
              <Pill tone={onboarding.completed_at ? "good" : "neutral"}>
                {onboarding.completed_at ? "Complete" : `${progress}% complete`}
              </Pill>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Follow these steps to connect your website, confirm events are flowing, choose how credit is assigned, and preview commissions.
            </p>
          </div>
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-white/5"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
          <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-6">
          {SETUP_WIZARD_STEPS.map((step) => {
            const isActive = step === activeStep;
            const isDone = completed.has(step);
            return (
              <button
                key={step}
                type="button"
                onClick={() => goToStep(step)}
                className={[
                  "flex min-h-16 items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition",
                  isActive ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950" : "bg-white hover:bg-slate-50 dark:bg-transparent dark:hover:bg-white/5",
                ].join(" ")}
              >
                <span>{SETUP_WIZARD_STEP_LABELS[step]}</span>
                {isDone ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : null}
              </button>
            );
          })}
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          {message}
        </div>
      ) : null}

      <section className="rounded-lg border bg-white p-5 shadow-sm dark:bg-ink/80">
        {activeStep === "workspace" ? (
          <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">Tell TraceKit about your company.</h2>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                Every event, customer journey, attribution decision, and commission belongs to your company workspace.
                This information is used throughout TraceKit for reporting, integrations, and operational defaults.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Company Name">
                  <input className="w-full rounded-md border bg-white px-3 py-2 text-sm dark:bg-transparent" value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} />
                </Field>
                <Field label="Primary Website" hint="The main website where visitors begin their journey.">
                  <input className="w-full rounded-md border bg-white px-3 py-2 text-sm dark:bg-transparent" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://example.com" />
                </Field>
                <Field label="Timezone" hint="Used when displaying reports and customer journeys.">
                  <select className="w-full rounded-md border bg-white px-3 py-2 text-sm dark:bg-ink" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                    {TIMEZONE_OPTIONS.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </Field>
                <Field label="Currency" hint="Used when displaying revenue and commissions.">
                  <select className="w-full rounded-md border bg-white px-3 py-2 text-sm dark:bg-ink" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    {CURRENCY_OPTIONS.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </Field>
              </div>
              <IntroCard icon={<Sparkles className="h-5 w-5" />} title="What happens next">
                TraceKit uses these defaults when showing reports, customer timelines, integrations, revenue, and commissions. Progress is saved automatically as you move through setup.
              </IntroCard>
              <PrimaryButton disabled={saving} onClick={saveWorkspace} icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}>Save company setup</PrimaryButton>
            </div>
            <aside className="rounded-lg border bg-slate-50 p-4 text-sm dark:bg-white/5">
              <div className="text-base font-semibold">Current Environment</div>
              <div className="mt-4 space-y-3">
                <StatusTile label="Company" value={workspaceName || "Not saved yet"} />
                <StatusTile label="Tracking Environment" value={websiteUrl ? "Website ready" : "Waiting for website"} tone={websiteUrl ? "good" : "warn"} />
                <StatusTile label="Workspace ID" value={workspaceId} />
              </div>
              <div className="mt-4 rounded-md bg-white p-3 text-slate-600 shadow-sm dark:bg-black/20 dark:text-slate-300">Your progress is saved automatically so you can leave and return later.</div>
            </aside>
          </div>
        ) : null}

        {activeStep === "browser_tracking" ? (
          <div className="space-y-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold">Install the TraceKit tracking script.</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                  The TraceKit browser SDK records page views, clicks, forms, purchases, and marketing parameters so customer journeys can be reconstructed later. Without this step TraceKit cannot build attribution.
                </p>
              </div>
              <Pill tone={browser.write_key_configured ? "good" : "warn"}>{browser.write_key_configured ? "Tracking key ready" : "Tracking key needed"}</Pill>
            </div>
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="space-y-4">
                <Field label="Websites to Track" hint="Enter one website per line.">
                  <textarea className="min-h-32 w-full rounded-md border bg-white px-3 py-2 text-sm dark:bg-transparent" value={allowedOrigins} onChange={(e) => setAllowedOrigins(e.target.value)} placeholder={"https://www.company.com\nhttps://shop.company.com"} />
                </Field>
                {!dismissedWarningSet.has("browser_write_key_rotation") ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                    <div>Generating a new tracking key means your website snippet may need to be updated. TraceKit shows the key only once.</div>
                    <button type="button" className="mt-3 text-xs font-semibold underline" onClick={() => dismissWarning("browser_write_key_rotation")}>
                      Dismiss warning
                    </button>
                  </div>
                ) : null}
                <details className="rounded-lg border bg-slate-50 p-4 text-sm dark:bg-white/5">
                  <summary className="cursor-pointer font-medium">Technical Details</summary>
                  <div className="mt-3 space-y-3 text-slate-600 dark:text-slate-300">
                    <p>Write Key is the technical name for the Tracking Key used by the browser SDK.</p>
                    <Field label="Per-minute event limit">
                      <input className="w-full rounded-md border bg-white px-3 py-2 text-sm dark:bg-transparent" value={rateLimit} onChange={(e) => setRateLimit(e.target.value)} inputMode="numeric" />
                    </Field>
                  </div>
                </details>
                <PrimaryButton disabled={saving || !parseAllowedOrigins(allowedOrigins).length} onClick={configureBrowser} icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : browser.write_key_configured ? <RotateCcw className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}>
                  {browser.write_key_configured ? "Generate New Tracking Key" : "Generate Tracking Key"}
                </PrimaryButton>
              </div>
              <div className="space-y-3">
                {lastWriteKey ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-100"><KeyRound className="h-4 w-4" /> New Tracking Key</div>
                    <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-100">This key allows your website to securely send browser events to TraceKit.</p>
                    <div className="mt-2 break-all rounded-md bg-white p-3 font-mono text-xs dark:bg-black/20">{lastWriteKey}</div>
                    <div className="mt-3"><CopyButton value={lastWriteKey} label="Copy Tracking Key" /></div>
                  </div>
                ) : null}
                <div className="rounded-lg border bg-slate-50 p-4 dark:bg-white/5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Installation snippet</div>
                    {installSnippet ? <CopyButton value={installSnippet} label="Copy snippet" /> : null}
                  </div>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Copy and paste this snippet into the &lt;head&gt; of every page you want TraceKit to track.</p>
                  <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{installSnippet || "Generate a tracking key to create the install snippet."}</pre>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <StatusTile label="Last Browser Event" value={latestReceived?.event_id || "None yet"} />
                  <StatusTile label="Last Processed Event" value={latestNormalized?.event_id || "None yet"} />
                  <StatusTile label="Pending events" value={String(browser.health?.pending_events ?? 0)} />
                  <StatusTile label="Events Requiring Attention" value={String(browser.health?.events_needing_review ?? 0)} />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {activeStep === "test_installation" ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-semibold">Verify Tracking</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Let&apos;s confirm that TraceKit is receiving real events from your website.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              {[
                ["Step 1", "Open your website.", <Globe2 key="open" className="h-5 w-5" />],
                ["Step 2", "Refresh the page.", <RefreshCw key="refresh" className="h-5 w-5" />],
                ["Step 3", "Return here.", <MousePointerClick key="return" className="h-5 w-5" />],
                ["TraceKit", "Automatically detects the event.", <CheckCircle2 key="detect" className="h-5 w-5" />],
              ].map(([label, text, icon]) => (
                <div key={String(label)} className="rounded-lg border bg-slate-50 p-4 dark:bg-white/5">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-black/20">{icon}</div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                  <div className="mt-1 text-sm font-medium">{text}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <PrimaryButton disabled={polling} onClick={startInstallationTest} icon={polling ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}>{polling ? "Watching for event" : "Start verification"}</PrimaryButton>
              <button type="button" className="inline-flex items-center gap-2 rounded-md border px-4 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-white/5" onClick={() => load({ quiet: true })}>
                <RefreshCw className="h-4 w-4" />
                Check now
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <CheckPanel title="Browser event detected" ok={receivedAfterTest || Boolean(latestReceived)} active={polling}>
                {latestReceived ? <EventDetails event={latestReceived} /> : <p>Don&apos;t worry. TraceKit has not seen a browser event yet.</p>}
              </CheckPanel>
              <CheckPanel title="Event processed" ok={normalizedAfterTest || Boolean(latestNormalized)} active={polling}>
                {latestNormalized ? <EventDetails event={latestNormalized} /> : <p>Once an event arrives, TraceKit will process it for customer journeys.</p>}
              </CheckPanel>
            </div>
            <details className="rounded-lg border bg-slate-50 p-4 text-sm dark:bg-white/5">
              <summary className="cursor-pointer font-medium">If no events appear</summary>
              <p className="mt-3 text-slate-600 dark:text-slate-300">Don&apos;t worry. Most installation issues are caused by:</p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
                <li>Tracking snippet not installed</li>
                <li>Website not listed under Websites to Track</li>
                <li>Browser cache</li>
                <li>Ad blockers</li>
              </ul>
            </details>
          </div>
        ) : null}

        {activeStep === "attribution" ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-semibold">Choose Attribution Model</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Attribution determines which marketing source receives credit for each conversion.</p>
            </div>
            <div className="rounded-lg border bg-slate-50 p-4 dark:bg-white/5">
              <div className="text-sm font-semibold">Simple example</div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <Pill>Google</Pill>
                <span>↓</span>
                <Pill>Facebook</Pill>
                <span>↓</span>
                <Pill tone="good">Purchase</Pill>
                <span className="font-medium">With First Touch, Google receives credit.</span>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              {MODEL_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  onClick={() => setActiveModel(option.value)}
                  className={`rounded-lg border p-4 text-left transition ${activeModel === option.value ? "border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950" : "bg-white hover:bg-slate-50 dark:bg-transparent dark:hover:bg-white/5"}`}
                >
                  <div className="font-semibold">{option.label}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-1 text-xs">
                    {option.path.map((item, index) => (
                      <React.Fragment key={`${option.value}:${item}`}>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700 dark:bg-black/20 dark:text-slate-100">{item}</span>
                        {index < option.path.length - 1 ? <span>↓</span> : null}
                      </React.Fragment>
                    ))}
                  </div>
                  <div className="mt-3 text-sm opacity-80">{option.winner}</div>
                </button>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Attribution model">
                <select className="w-full rounded-md border bg-white px-3 py-2 text-sm dark:bg-ink" value={activeModel} onChange={(e) => setActiveModel(e.target.value)}>
                  {MODEL_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
              <Field label="Default Commission Percentage" hint="0.05 = 5%. Leave at 0% if you only want to validate attribution.">
                <input className="w-full rounded-md border bg-white px-3 py-2 text-sm dark:bg-transparent" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} inputMode="decimal" />
              </Field>
            </div>
            <details className="rounded-lg border bg-slate-50 p-4 text-sm dark:bg-white/5">
              <summary className="cursor-pointer font-medium">Technical Details</summary>
              <div className="mt-3 max-w-sm">
                <Field label="Model version">
                  <input className="w-full rounded-md border bg-white px-3 py-2 text-sm dark:bg-transparent" value={modelVersion} onChange={(e) => setModelVersion(e.target.value)} />
                </Field>
              </div>
            </details>
            <div className="grid gap-3 md:grid-cols-3">
              <StatusTile label="Current Attribution Model" value={policy.active_model || "Not saved"} />
              <StatusTile label="Default Commission Percentage" value={formatCommissionPercentage(policy.default_commission_rate ?? 0)} />
              <StatusTile label="Policy" value={policy.exists ? "Saved" : "Not saved"} tone={policy.exists ? "good" : "warn"} />
            </div>
            <PrimaryButton disabled={saving} onClick={savePolicy} icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}>Save attribution model</PrimaryButton>
          </div>
        ) : null}

        {activeStep === "payout_validation" ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-semibold">Preview Commissions</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">TraceKit will simulate commission generation without creating payable commissions.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <StatusTile label="Policy" value={policy.exists ? "Active" : "Default only"} />
              <StatusTile label="Eligible Credits" value={String((validationResult || snapshot?.payout_validation)?.eligible_credits ?? 0)} />
              <StatusTile label="Generated" value={String((validationResult || snapshot?.payout_validation)?.commissions_generated ?? 0)} />
              <StatusTile label="Duplicates Skipped" value={String((validationResult || snapshot?.payout_validation)?.duplicate_commissions_skipped ?? 0)} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <IntroCard icon={<Users className="h-5 w-5" />} title="Eligible Credits">Conversions that qualify for commission.</IntroCard>
              <IntroCard icon={<DollarSign className="h-5 w-5" />} title="Generated">Commissions that would be created.</IntroCard>
              <IntroCard icon={<CreditCard className="h-5 w-5" />} title="Duplicates Skipped">Conversions that already have commissions.</IntroCard>
            </div>
            <PrimaryButton disabled={saving} onClick={runPayoutValidation} icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}>Preview Commission Generation</PrimaryButton>
            <div className="rounded-lg border">
              <div className="border-b px-4 py-3 text-sm font-medium">Latest draft commissions</div>
              <div className="divide-y">
                {(snapshot?.latest_draft_commissions || []).length ? snapshot?.latest_draft_commissions.map((commission: any) => (
                  <div key={commission.commission_event_id || commission.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-4">
                    <div className="truncate">{commission.affiliate_id || "No affiliate"}</div>
                    <div>{commission.commission_amount || "0"} {commission.currency || ""}</div>
                    <div className="truncate">{commission.model || "model"}</div>
                    <div><Pill>{commission.status || "draft"}</Pill></div>
                  </div>
                )) : <div className="px-4 py-6 text-sm text-slate-500">No draft commissions yet.</div>}
              </div>
            </div>
          </div>
        ) : null}

        {activeStep === "completion" ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-semibold">Your TraceKit workspace is ready.</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Browser tracking, attribution, and commission generation are configured. From here you can monitor customer journeys, debug attribution, and review payouts.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <StatusTile label="Tracking" value={browser.write_key_configured ? "Ready" : "Needs key"} tone={browser.write_key_configured ? "good" : "warn"} />
              <StatusTile label="Last Event" value={latestReceived?.received_at || "None yet"} tone={latestReceived ? "good" : "warn"} />
              <StatusTile label="Attribution" value={policy.active_model || "First Touch"} tone="good" />
              <StatusTile label="Commission Rate" value={formatCommissionPercentage(policy.default_commission_rate ?? 0)} />
              <StatusTile label="Payout Engine" value={policy.exists ? "Ready" : "Ready with defaults"} tone="good" />
              <StatusTile label="Items Needing Attention" value={String(failedSections.length)} tone={failedSections.length ? "warn" : "good"} />
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                ["/journeys", "View Customer Journeys"],
                ["/events", "View Events"],
                ["/journeys", "View Attribution"],
                ["/reports", "View Commissions"],
                ["/settings/integrations", "Integrations"],
              ].map(([href, label]) => (
                <a key={`${href}:${label}`} href={href} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-white/5">
                  {label}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ))}
            </div>
            <PrimaryButton disabled={saving} onClick={completeSetup} icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}>Mark setup complete</PrimaryButton>
          </div>
        ) : null}
      </section>

      {failedSections.length ? (
        <details className="rounded-lg border bg-white p-4 text-sm dark:bg-ink/80">
          <summary className="cursor-pointer font-medium">Technical Details</summary>
          <div className="mt-3 space-y-2">
            {failedSections.map((item) => (
              <div key={item.section} className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <div>
                  <div className="font-medium">{item.section} needs attention</div>
                  <div>Setup services are temporarily unavailable. Please contact your administrator if the issue continues.</div>
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function StatusTile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "good" | "warn" | "bad" }) {
  return (
    <div className="rounded-lg border bg-slate-50 p-3 dark:bg-white/5">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
      <div className="mt-2"><Pill tone={tone}>{tone === "good" ? "Ready" : tone === "warn" ? "Needs attention" : "Status"}</Pill></div>
    </div>
  );
}

function CheckPanel({ title, ok, active, children }: { title: string; ok: boolean; active?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium">{title}</div>
        {ok ? <Pill tone="good">Confirmed</Pill> : active ? <Pill tone="warn">Waiting</Pill> : <Pill>Not started</Pill>}
      </div>
      <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">{children}</div>
    </div>
  );
}

function EventDetails({ event }: { event: ReturnType<typeof latestEventSummary> }) {
  if (!event) return null;
  return (
    <dl className="grid gap-2 text-sm">
      <div className="flex justify-between gap-4"><dt className="text-slate-500">Event ID</dt><dd className="truncate font-mono">{event.event_id || "unknown"}</dd></div>
      <div className="flex justify-between gap-4"><dt className="text-slate-500">Type</dt><dd>{event.event_type}</dd></div>
      <div className="flex justify-between gap-4"><dt className="text-slate-500">Received</dt><dd>{event.received_at || "unknown"}</dd></div>
      <div className="flex justify-between gap-4"><dt className="text-slate-500">Status</dt><dd>{event.normalization_status}</dd></div>
    </dl>
  );
}
