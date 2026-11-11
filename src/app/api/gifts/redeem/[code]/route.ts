import { NextResponse } from "next/server";
import { publicBooking } from "@/lib/bookings/public";
import { getGiftByCode } from "@/lib/gifts/repo";
import { redeemGift } from "@/lib/gifts/service";
import { redeemView } from "@/lib/gifts/view";
import { readJson, toResponse } from "@/lib/paypal/http";
import { visitorId } from "@/lib/visitor";

const CODE = /^[A-Za-z0-9_-]{22}$/;

/** The recipient's view of their gift. */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const g = CODE.test(code) ? await getGiftByCode(code) : null;
    if (!g) return NextResponse.json({ error: "Gift not found" }, { status: 404 });
    return NextResponse.json(redeemView(g));
  } catch (err) {
    return toResponse(err);
  }
}

/** Redeem: { startsAt } → the recipient's confirmed booking. */
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const userId = visitorId(req);
    const { code } = await params;
    if (!CODE.test(code)) return NextResponse.json({ error: "Gift not found" }, { status: 404 });
    const b = await readJson(req);
    const { booking } = await redeemGift({ code, userId, startsAt: b.startsAt });
    return NextResponse.json(publicBooking(booking), { status: 201 });
  } catch (err) {
    return toResponse(err);
  }
}
