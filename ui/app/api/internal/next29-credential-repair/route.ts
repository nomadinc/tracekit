import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  activeTypedCommerceCredential,
  rotateTypedCommerceCredential,
} from "@/lib/commerce/typed-credential-store";

export const runtime = "nodejs";

const CONNECTION_ID = "3c9a11bf-d4bc-4328-b627-0808d0db5670";
const ORGANIZATION_ID = "5f1de64a-1b37-40bb-81c8-32197eda0b41";

function authorized(request: Request) {
  const expected = String(process.env.TRACEKIT_NEXT29_CREDENTIAL_REPAIR_TOKEN || "");
  const supplied = String(request.headers.get("x-tracekit-repair-token") || "");

  if (!expected || !supplied) return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);

  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (
    process.env.VERCEL_ENV !== "production" ||
    process.env.TRACEKIT_NEXT29_WEBHOOK_RUNTIME_ENV !== "production"
  ) {
    return NextResponse.json({ ok: false, code: "unavailable" }, { status: 404 });
  }

  if (!authorized(request)) {
    return NextResponse.json({ ok: false, code: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { secret?: unknown } | null;
  const secret = typeof body?.secret === "string" ? body.secret.trim() : "";

  if (secret.length < 8 || secret.length > 500) {
    return NextResponse.json({ ok: false, code: "invalid_secret" }, { status: 400 });
  }

  const previous = await activeTypedCommerceCredential({
    connectionId: CONNECTION_ID,
    credentialType: "webhook_signing_secret",
  });

  if (!previous?.id) {
    return NextResponse.json({ ok: false, code: "credential_unavailable" }, { status: 409 });
  }

  await rotateTypedCommerceCredential({
    organizationId: ORGANIZATION_ID,
    connectionId: CONNECTION_ID,
    credentialType: "webhook_signing_secret",
    previousId: String(previous.id),
    secret,
  });

  return NextResponse.json({
    ok: true,
    rotated: true,
  });
}
