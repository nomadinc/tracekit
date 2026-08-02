import { createHmac, timingSafeEqual } from "node:crypto";

export const ACTIVE_ORGANIZATION_COOKIE = "tracekit-active-organization";
type Payload = { userId: string; organizationId: string; expiresAt: number };

function secret() {
  const value = process.env.WORKOS_COOKIE_PASSWORD;
  if (!value || value.length < 32) throw new Error("Secure session configuration is unavailable.");
  return value;
}
function signature(encoded: string) {
  return createHmac("sha256", secret()).update(encoded).digest("base64url");
}

export function sealActiveOrganization(payload: Payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function readActiveOrganization(value: string | undefined, userId: string, now = Date.now()) {
  if (!value) return null;
  const [encoded, supplied] = value.split(".");
  if (!encoded || !supplied) return null;
  const expected = signature(encoded);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as Payload;
    return payload.userId === userId && payload.expiresAt > now ? payload.organizationId : null;
  } catch { return null; }
}
