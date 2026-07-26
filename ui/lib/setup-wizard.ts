export const SETUP_WIZARD_STEPS = [
  "workspace",
  "browser_tracking",
  "test_installation",
  "attribution",
  "payout_validation",
  "completion",
] as const;

export type SetupWizardStep = (typeof SETUP_WIZARD_STEPS)[number];

export const SETUP_WIZARD_STEP_LABELS: Record<SetupWizardStep, string> = {
  workspace: "Company Setup",
  browser_tracking: "Install Tracking",
  test_installation: "Verify Tracking",
  attribution: "Choose Attribution Model",
  payout_validation: "Preview Commissions",
  completion: "You're Ready",
};

export function isSetupWizardStep(value: unknown): value is SetupWizardStep {
  return SETUP_WIZARD_STEPS.includes(String(value || "") as SetupWizardStep);
}

export function normalizeSetupStep(value: unknown): SetupWizardStep {
  return isSetupWizardStep(value) ? value : "workspace";
}

export function setupStepIndex(step: SetupWizardStep) {
  return Math.max(0, SETUP_WIZARD_STEPS.indexOf(step));
}

export function setupProgressPercent(completedSteps: unknown[]) {
  const completed = new Set(
    (Array.isArray(completedSteps) ? completedSteps : []).filter(isSetupWizardStep)
  );
  return Math.round((completed.size / SETUP_WIZARD_STEPS.length) * 100);
}

export function parseAllowedOrigins(value: string) {
  return Array.from(
    new Set(
      String(value || "")
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

export function formatAllowedOrigins(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean).join("\n")
    : "";
}

export function eventTimestamp(value: any) {
  return String(value?.received_at || value?.normalized_at || value?.event_time || "").trim();
}

export function eventOccurredAfter(event: any, startedAt: string | null) {
  if (!event || !startedAt) return false;
  const eventMs = Date.parse(eventTimestamp(event));
  const startedMs = Date.parse(startedAt);
  return Number.isFinite(eventMs) && Number.isFinite(startedMs) && eventMs >= startedMs;
}

export function latestEventSummary(event: any) {
  if (!event) return null;
  return {
    event_id: String(event.event_id || ""),
    event_type: String(event.normalized_event_type || event.event_type || event.type || "unknown"),
    received_at: String(event.received_at || event.created_at || ""),
    normalized_at: String(event.normalized_at || ""),
    normalization_status: String(event.normalization_status || "unknown"),
  };
}

export function mergeCompletedSteps(current: unknown[], step: SetupWizardStep) {
  return Array.from(new Set([...(Array.isArray(current) ? current : []), step].filter(isSetupWizardStep)));
}
