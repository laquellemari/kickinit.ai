import { NextResponse } from "next/server";
import { loadRelevant } from "@/lib/passport/load";
import { MAX_TAGS } from "@/lib/passport/passport";
import { HttpError, toResponse } from "@/lib/paypal/http";
import { visitorId } from "@/lib/visitor";

const TAG = /^[a-z0-9_]{1,40}$/;

/** GET /api/passport/quests?tags=spa,wellness  The quests a visit with these tags counts toward, with my progress. */
export async function GET(req: Request) {
  try {
    const userId = visitorId(req);
    const tags = (new URL(req.url).searchParams.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
    if (!tags.length) throw new HttpError(400, "Tags are required");
    if (tags.length > MAX_TAGS) throw new HttpError(400, `At most ${MAX_TAGS} tags`);
    if (!tags.every((t) => TAG.test(t))) throw new HttpError(400, "Tags are lowercase words like spa or live_music");
    return NextResponse.json({ quests: await loadRelevant(userId, tags) });
  } catch (err) {
    return toResponse(err);
  }
}
