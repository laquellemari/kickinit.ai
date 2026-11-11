import { NextResponse } from "next/server";
import { getGift, listContributions } from "@/lib/gifts/repo";
import { closeIfDue } from "@/lib/gifts/service";
import { giftView } from "@/lib/gifts/view";
import { toResponse } from "@/lib/paypal/http";
import { visitorId } from "@/lib/visitor";

const UUID = /^[0-9a-f-]{36}$/;

/** The gift page: anyone with the link can see progress and chip in. Closes the pool if its deadline has passed. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    let viewer: string | null = null;
    try {
      viewer = visitorId(req);
    } catch {
      viewer = null;
    }
    const found = UUID.test(id) ? await getGift(id) : null;
    if (!found) return NextResponse.json({ error: "Gift not found" }, { status: 404 });
    const g = await closeIfDue(found, new Date());
    return NextResponse.json(giftView(g, await listContributions(g.id), viewer));
  } catch (err) {
    return toResponse(err);
  }
}
