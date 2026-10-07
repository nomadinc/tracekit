import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const requested = new URL(request.url).searchParams.get("returnTo") || "/";
    const returnPathname = /^\/invitations\/[0-9a-f-]{36}$/.test(requested) ? requested : "/";
    return NextResponse.redirect(await getSignInUrl({ returnTo: returnPathname }));
  } catch {
    return NextResponse.json({ error: "Authentication is temporarily unavailable." }, { status: 503 });
  }
}
