import { NextResponse } from "next/server";
import { createGift } from "@/lib/gifts/service";
import { giftView } from "@/lib/gifts/view";
import { isMember } from "@/lib/membership/membership";
import { readJson, toResponse } from "@/lib/paypal/http";
import { visitorId } from "@/lib/visitor";

/** Start a gift: { experienceId, partySize, organizerName, recipientName, note?, mode: "solo" | "pool", deadline? } */
export async function POST(req: Request) {
  try {
    const organizerId = visitorId(req);
    const b = await readJson(req);
    const g = await createGift({
      organizerId, organizerName: b.organizerName, experienceId: b.experienceId, partySize: Number(b.partySize),
      recipientName: b.recipientName, note: b.note, mode: b.mode, deadline: b.deadline, organizerMember: await isMember(organizerId),
    });
    return NextResponse.json(giftView(g, [], organizerId), { status: 201 });
  } catch (err) {
    return toResponse(err);
  }
}
