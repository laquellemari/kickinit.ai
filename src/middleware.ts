import { NextResponse, type NextRequest } from "next/server";

const COOKIE = "kid";

/** Give every visitor an anonymous id cookie so their bookings and passport belong to them. */
export function middleware(req: NextRequest) {
  if (req.cookies.get(COOKIE)) return NextResponse.next();
  const id = crypto.randomUUID();
  // Make it visible to API routes on this very request too.
  const headers = new Headers(req.headers);
  headers.set("cookie", [req.headers.get("cookie"), `${COOKIE}=${id}`].filter(Boolean).join("; "));
  const res = NextResponse.next({ request: { headers } });
  res.cookies.set(COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
