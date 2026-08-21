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
  return emptyInstallation ? { kind: "bootstrap" } : { kind: "no-membership" };
}

export function normalizeBootstrapName(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 120 ? normalized : null;
}
