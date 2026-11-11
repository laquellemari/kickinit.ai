import { HttpError } from "@/lib/paypal/http";

export const VISITOR_COOKIE = "kid";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The anonymous visitor id set by middleware. Bookings belong to it. */
export function visitorId(req: Request): string {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.split(/;\s*/).find((c) => c.startsWith(`${VISITOR_COOKIE}=`));
  const id = match?.slice(VISITOR_COOKIE.length + 1);
  if (!id || !UUID.test(id)) throw new HttpError(401, "We couldn't identify your browser. Reload the page and try again.");
  return id;
}

export function isAdmin(req: Request): boolean {
  const expected = process.env.ADMIN_API_KEY;
  return !!expected && req.headers.get("x-admin-key") === expected;
}
