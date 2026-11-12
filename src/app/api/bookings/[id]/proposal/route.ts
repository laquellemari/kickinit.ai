import { NextResponse } from "next/server";
import { publicBooking } from "@/lib/bookings/public";
import { answerProposal } from "@/lib/bookings/service";
import { readJson, toResponse } from "@/lib/paypal/http";
import { visitorId } from "@/lib/visitor";

/** The guest answers an offered time: { accept: true } takes it (and confirms), { accept: false } releases the hold. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = visitorId(req);
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    const body = await readJson(req);
    return NextResponse.json(publicBooking(await answerProposal({ id, userId, accept: body.accept })));
  } catch (err) {
    return toResponse(err);
  }
}
