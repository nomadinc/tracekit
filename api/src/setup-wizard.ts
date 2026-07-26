import { cleanText } from "./identity-normalization.ts";

export const SETUP_WIZARD_STEPS = [
  "workspace",
  "browser_tracking",
  "test_installation",
  "attribution",
  "payout_validation",
  "completion",
] as const;

export type SetupWizardStep = (typeof SETUP_WIZARD_STEPS)[number];

export type WorkspaceOnboardingRow = {
  workspace_id: string;
  workspace_name: string | null;
  primary_website_url: string | null;
  default_timezone: string;
  default_currency: string;
  current_step: SetupWizardStep;
  completed_steps: SetupWizardStep[];
  dismissed_warnings: string[];
  completed_at: string | null;
  metadata: Record<string, any>;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SetupWizardRouteMatch =
  | { kind: "get_setup" }
  | { kind: "save_workspace" }
  | { kind: "save_progress" }
  | { kind: "method_not_allowed"; path: string; allowed_methods: string[] };

export function normalizeSetupWorkspaceId(value: unknown) {
  return cleanText(value) || "default";
}

export function normalizeSetupWizardStep(value: unknown): SetupWizardStep {
  const step = cleanText(value);
  return (SETUP_WIZARD_STEPS as readonly string[]).includes(step)
    ? step as SetupWizardStep
    : "workspace";
}

export function normalizeSetupWizardSteps(value: unknown): SetupWizardStep[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<SetupWizardStep>();
  for (const item of value) {
    const step = cleanText(item);
    if ((SETUP_WIZARD_STEPS as readonly string[]).includes(step)) seen.add(step as SetupWizardStep);
  }
  return Array.from(seen);
}

export function normalizeSetupWarningIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => cleanText(item)).filter(Boolean))).slice(0, 100);
}

export function normalizeSetupCurrency(value: unknown) {
  const currency = cleanText(value || "USD").toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "USD";
}

export function normalizeSetupTimezone(value: unknown) {
  return cleanText(value || "UTC") || "UTC";
}

export function normalizeSetupWebsiteUrl(value: unknown) {
  const text = cleanText(value);
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return url.origin;
  } catch {
    return text.slice(0, 300);
  }
}

function normalizeMetadata(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

export function defaultWorkspaceOnboarding(workspaceId: string): WorkspaceOnboardingRow {
  return {
    workspace_id: normalizeSetupWorkspaceId(workspaceId),
    workspace_name: null,
    primary_website_url: null,
    default_timezone: "UTC",
    default_currency: "USD",
    current_step: "workspace",
    completed_steps: [],
    dismissed_warnings: [],
    completed_at: null,
    metadata: {},
  };
}

export function compactWorkspaceOnboarding(row: Partial<WorkspaceOnboardingRow> | null | undefined, workspaceId = "default") {
  const fallback = defaultWorkspaceOnboarding(workspaceId);
  const source = row || fallback;
  return {
    workspace_id: normalizeSetupWorkspaceId(source.workspace_id || workspaceId),
    workspace_name: cleanText(source.workspace_name) || null,
    primary_website_url: normalizeSetupWebsiteUrl(source.primary_website_url),
    default_timezone: normalizeSetupTimezone(source.default_timezone),
    default_currency: normalizeSetupCurrency(source.default_currency),
    current_step: normalizeSetupWizardStep(source.current_step),
    completed_steps: normalizeSetupWizardSteps(source.completed_steps),
    dismissed_warnings: normalizeSetupWarningIds(source.dismissed_warnings),
    completed_at: cleanText(source.completed_at) || null,
    metadata: normalizeMetadata(source.metadata),
    exists: Boolean(row),
  };
}

export function normalizeWorkspaceSetupRequest(body: any) {
  return {
    workspace_id: normalizeSetupWorkspaceId(body?.workspace_id || body?.workspaceId),
    workspace_name: cleanText(body?.workspace_name || body?.workspaceName) || null,
    primary_website_url: normalizeSetupWebsiteUrl(body?.primary_website_url || body?.primaryWebsiteUrl),
    default_timezone: normalizeSetupTimezone(body?.default_timezone || body?.defaultTimezone),
    default_currency: normalizeSetupCurrency(body?.default_currency || body?.defaultCurrency),
    current_step: normalizeSetupWizardStep(body?.current_step || body?.currentStep || "browser_tracking"),
    completed_steps: normalizeSetupWizardSteps(body?.completed_steps || body?.completedSteps || ["workspace"]),
    dismissed_warnings: normalizeSetupWarningIds(body?.dismissed_warnings || body?.dismissedWarnings),
    metadata: normalizeMetadata(body?.metadata),
  };
}

export function normalizeSetupProgressRequest(body: any) {
  const completedAtRaw = body?.completed_at ?? body?.completedAt;
  const completedAt = completedAtRaw === null
    ? null
    : cleanText(completedAtRaw) || (body?.mark_completed || body?.markCompleted ? new Date().toISOString() : undefined);
  return {
    workspace_id: normalizeSetupWorkspaceId(body?.workspace_id || body?.workspaceId),
    current_step: normalizeSetupWizardStep(body?.current_step || body?.currentStep),
    completed_steps: normalizeSetupWizardSteps(body?.completed_steps || body?.completedSteps),
    dismissed_warnings: normalizeSetupWarningIds(body?.dismissed_warnings || body?.dismissedWarnings),
    completed_at: completedAt,
    metadata: normalizeMetadata(body?.metadata),
  };
}

export function matchSetupWizardRoute(method: string, path: string): SetupWizardRouteMatch | null {
  const normalizedMethod = cleanText(method).toUpperCase();
  if (/^\/v1\/setup-wizard\/?$/.test(path)) {
    if (normalizedMethod === "GET") return { kind: "get_setup" };
    return { kind: "method_not_allowed", path: "/v1/setup-wizard", allowed_methods: ["GET"] };
  }
  if (/^\/v1\/setup-wizard\/workspace\/?$/.test(path)) {
    if (normalizedMethod === "POST") return { kind: "save_workspace" };
    return { kind: "method_not_allowed", path: "/v1/setup-wizard/workspace", allowed_methods: ["POST"] };
  }
  if (/^\/v1\/setup-wizard\/progress\/?$/.test(path)) {
    if (normalizedMethod === "POST") return { kind: "save_progress" };
    return { kind: "method_not_allowed", path: "/v1/setup-wizard/progress", allowed_methods: ["POST"] };
  }
  return null;
}

export async function getWorkspaceOnboardingState(supabase: any, workspaceId: string) {
  const normalizedWorkspaceId = normalizeSetupWorkspaceId(workspaceId);
  const { data, error } = await supabase
    .from("workspace_onboarding")
    .select("*")
    .eq("workspace_id", normalizedWorkspaceId)
    .maybeSingle();
  if (error) throw new Error(`Workspace onboarding lookup failed: ${error.message}`);
  return compactWorkspaceOnboarding(data as WorkspaceOnboardingRow | null, normalizedWorkspaceId);
}

export async function upsertWorkspaceSetupState(supabase: any, body: any) {
  const parsed = normalizeWorkspaceSetupRequest(body);
  const { data: existing, error: lookupError } = await supabase
    .from("workspace_onboarding")
    .select("*")
    .eq("workspace_id", parsed.workspace_id)
    .maybeSingle();
  if (lookupError) throw new Error(`Workspace onboarding lookup failed: ${lookupError.message}`);
  const current = compactWorkspaceOnboarding(existing as WorkspaceOnboardingRow | null, parsed.workspace_id);
  const row = {
    workspace_id: parsed.workspace_id,
    workspace_name: parsed.workspace_name,
    primary_website_url: parsed.primary_website_url,
    default_timezone: parsed.default_timezone,
    default_currency: parsed.default_currency,
    current_step: parsed.current_step,
    completed_steps: Array.from(new Set([...current.completed_steps, ...parsed.completed_steps])),
    dismissed_warnings: Array.from(new Set([...current.dismissed_warnings, ...parsed.dismissed_warnings])),
    metadata: { ...current.metadata, ...parsed.metadata },
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("workspace_onboarding")
    .upsert(row, { onConflict: "workspace_id" })
    .select("*")
    .single();
  if (error) throw new Error(`Workspace onboarding save failed: ${error.message}`);
  return compactWorkspaceOnboarding(data as WorkspaceOnboardingRow, parsed.workspace_id);
}

export async function upsertSetupProgressState(supabase: any, body: any) {
  const parsed = normalizeSetupProgressRequest(body);
  const current = await getWorkspaceOnboardingState(supabase, parsed.workspace_id);
  const row: Record<string, any> = {
    workspace_id: parsed.workspace_id,
    workspace_name: current.workspace_name,
    primary_website_url: current.primary_website_url,
    default_timezone: current.default_timezone,
    default_currency: current.default_currency,
    current_step: parsed.current_step,
    completed_steps: Array.from(new Set([...current.completed_steps, ...parsed.completed_steps])),
    dismissed_warnings: Array.from(new Set([...current.dismissed_warnings, ...parsed.dismissed_warnings])),
    metadata: { ...current.metadata, ...parsed.metadata },
    updated_at: new Date().toISOString(),
  };
  if (parsed.completed_at !== undefined) row.completed_at = parsed.completed_at;
  const { data, error } = await supabase
    .from("workspace_onboarding")
    .upsert(row, { onConflict: "workspace_id" })
    .select("*")
    .single();
  if (error) throw new Error(`Workspace onboarding progress save failed: ${error.message}`);
  return compactWorkspaceOnboarding(data as WorkspaceOnboardingRow, parsed.workspace_id);
}
