import { createHmac, timingSafeEqual } from "node:crypto";
export const ACTIVE_ACCOUNT_COOKIE = "tracekit-active-account";
function signature(value: string) {
  const secret = process.env.WORKOS_COOKIE_PASSWORD;
  if (!secret || secret.length < 32) throw new Error("Secure session configuration is unavailable.");
  return createHmac("sha256", secret).update(`active-account:${value}`).digest("base64url");
}
export function sealActiveAccount(payload: {userId: string; accountId: string; expiresAt: number}) {
  const value = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${value}.${signature(value)}`;
}
export function readActiveAccount(value: string | undefined, userId: string, now = Date.now()): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const expected = Buffer.from(signature(parts[0])), supplied = Buffer.from(parts[1]);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    return payload.userId === userId && typeof payload.accountId === "string" && payload.expiresAt > now ? payload.accountId : null;
  } catch { return null; }
}
