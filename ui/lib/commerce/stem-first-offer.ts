import type { TraceKitSessionContext } from "@/lib/identity/persistent-types";
import { AuthorizationDeniedError, requireResourceScope } from "@/lib/identity/authorization-gateway";

export const STEM_ORGANIZATION = "8f6bb14b-2126-49b8-bfdb-c60edbc3549b";
export function authorizeStemFirstOffer(session: TraceKitSessionContext) {
  if (session.activeOrganization?.id !== STEM_ORGANIZATION ||
      session.activeAccount.id !== "4dcad1a0-48af-4c5c-8b32-15c1c89ccd1d" ||
      !session.accessibleBusinessContexts.some(c => c.id === "stem-labs-8f6bb14b"))
    throw new AuthorizationDeniedError();
  requireResourceScope(session, STEM_ORGANIZATION, "offers.manage");
}
