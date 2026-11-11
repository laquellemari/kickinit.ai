import { NextResponse } from "next/server";
import { listContributionsBy, listContributions, listGiftsByOrganizer } from "@/lib/gifts/repo";
import { fromCents, raisedCents } from "@/lib/gifts/service";
import { toResponse } from "@/lib/paypal/http";
import { visitorId } from "@/lib/visitor";

/** Gifts I started and gifts I chipped in to. */
export async function GET(req: Request) {
  try {
    const me = visitorId(req);
    const [organized, chipped] = await Promise.all([listGiftsByOrganizer(me), listContributionsBy(me)]);
    const withRaised = await Promise.all(organized.map(async (g) => ({
      id: g.id, name: g.name, recipientName: g.recipientName, status: g.status, mode: g.mode,
      amount: fromCents(g.amountCents), raised: fromCents(raisedCents(await listContributions(g.id))),
    })));
    return NextResponse.json({
      organized: withRaised,
      chippedIn: chipped.map((c) => ({ giftId: c.giftId, giftName: c.giftName, recipientName: c.recipientName, amount: fromCents(c.amountCents), status: c.status, giftStatus: c.giftStatus })),
    });
  } catch (err) {
    return toResponse(err);
  }
}
