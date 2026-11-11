import { NextResponse } from "next/server";
import { listBookings } from "@/lib/bookings/repo";
import { clientKey, createLimiter } from "@/lib/concierge/rate-limit";
import { conciergeModel } from "@/lib/concierge/runtime";
import { suggestIdeas, type IdeaMode } from "@/lib/ideas/ideas";
import { recentSearches } from "@/lib/ideas/repo";
import { HttpError, readJson, toResponse } from "@/lib/paypal/http";
import { visitorId } from "@/lib/visitor";

const limiter = createLimiter({ limit: 10, windowMs: 60_000 });

/** POST /api/ideas  { mode?: "you" | "them", where? }  Three ideas built on this visitor's searches and bookings. */
export async function POST(req: Request) {
  try {
    if (!limiter.take(clientKey(req))) throw new HttpError(429, "Too many requests. Try again in a minute.");
    const userId = visitorId(req);
    const body = await readJson(req);
    const mode = (body.mode ?? "you") as IdeaMode;
    if (mode !== "you" && mode !== "them") throw new HttpError(400, "Mode must be you or them");
    if (body.where !== undefined && (typeof body.where !== "string" || body.where.length > 100)) throw new HttpError(400, "Where must be text up to 100 characters");
    let model;
    try {
      model = conciergeModel();
    } catch (err) {
      throw new HttpError(503, (err as Error).message);
    }
    const [searches, bookings] = await Promise.all([recentSearches(userId), listBookings({ userId })]);
    const booked = bookings.filter((b) => b.status !== "declined" && b.status !== "failed").slice(0, 10).map((b) => b.name);
    return NextResponse.json(await suggestIdeas({ mode, where: ((body.where as string | undefined) ?? "").trim(), searches: searches.map((s) => s.text), booked }, model));
  } catch (err) {
    return toResponse(err);
  }
}
