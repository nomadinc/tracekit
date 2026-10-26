import { NextResponse } from "next/server";

// WS-030: Release 1.0 permanent Edge exclusion. No environment, session, or I/O.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function excluded() {
  return NextResponse.json({ error: "The requested resource is unavailable." }, { status: 404, headers: { "Cache-Control": "no-store" } });
}
export async function POST() { return excluded(); }
