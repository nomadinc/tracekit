import "server-only";
import { notFound } from "next/navigation";
import { resolveApplicationSession } from "../identity/application-session";
import { requirePlatformAdmin } from "./admin-policy";
import type { Permission } from "../identity/permissions";
import { assertCanonicalPlatformMembership } from "./platform-access";
export async function platformSession(
  permission: Permission = "admin.manage_tenants",
) {
  const resolution = await resolveApplicationSession();
  if (resolution.kind !== "authenticated") notFound();
  try {
    requirePlatformAdmin(resolution.session, permission);
  } catch {
    notFound();
  }
  try { await assertCanonicalPlatformMembership(resolution.session, permission); } catch { notFound(); }
  return resolution.session;
}
