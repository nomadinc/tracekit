export const FIRST_ADMIN_ROLE = "organization-owner" as const;

export type InstallationCounts = {
  organizations: number;
  accounts: number;
  memberships: number;
};

export function canBootstrapEmptyInstallation(counts: InstallationCounts) {
  return counts.organizations === 0 && counts.accounts === 0 && counts.memberships === 0;
}

export async function resolveUnaffiliatedSessionState(
  isEmptyInstallation: () => Promise<boolean>,
): Promise<{ kind: "bootstrap" } | { kind: "no-membership" }> {
  const emptyInstallation = await isEmptyInstallation();
  const state = emptyInstallation ? "bootstrap" : "no-membership";
  if (process.env.NODE_ENV !== "test") {
    console.log(`TRACEKIT_SESSION_STATE=${state}`);
    console.log(`TRACEKIT_EMPTY_INSTALLATION=${emptyInstallation}`);
  }
  return { kind: state };
}

export function normalizeBootstrapName(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 120 ? normalized : null;
}
