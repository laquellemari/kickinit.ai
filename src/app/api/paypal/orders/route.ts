import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { priceFor } from "@/lib/bookings/pricing";
import { BookingError } from "@/lib/bookings/service";
import { getGift, listContributions } from "@/lib/gifts/repo";
import { checkContribution, fromCents, toCents } from "@/lib/gifts/service";
import { createHoldOrder } from "@/lib/paypal/client";
import { readJson, toResponse } from "@/lib/paypal/http";

/**
 * Create a PayPal order that will hold (not charge) the buyer's funds.
 * Body: { kind: "partner" | "live", itemId, partySize } (or the older { experienceId, partySize }),
 * or { kind: "gift", giftId, amount } to chip in to a gift.
 * The price is looked up on the server; any amount sent is ignored.
 */
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    if (body.kind === "gift") return NextResponse.json(await giftOrder(body), { status: 201 });
    const legacy = body.kind === undefined;
    if (legacy && (typeof body.experienceId !== "string" || !body.experienceId)) throw new Error("Experience id is required");
    const { quote: q } = await priceFor(legacy ? "partner" : body.kind, legacy ? body.experienceId : body.itemId, Number(body.partySize));
    const order = await createHoldOrder({
      amount: q.total,
      currency: q.currency,
      description: q.description,
      referenceId: `${q.experienceId}:${randomUUID()}`,
      requestId: randomUUID(),
    });
    return NextResponse.json({ ...order, quote: q }, { status: 201 });
  } catch (err) {
    return toResponse(err);
  }
}

async function giftOrder(body: Record<string, unknown>) {
  const g = typeof body.giftId === "string" && /^[0-9a-f-]{36}$/.test(body.giftId) ? await getGift(body.giftId) : null;
  if (!g) throw new BookingError(404, "Gift not found");
  const cents = typeof body.amount === "string" && /^\d+(\.\d{1,2})?$/.test(body.amount) ? toCents(body.amount) : NaN;
  checkContribution(g, await listContributions(g.id), cents, new Date());
  const amount = fromCents(cents);
  const order = await createHoldOrder({
    amount,
    currency: g.currency,
    description: `Gift for ${g.recipientName}: ${g.name}`.slice(0, 127),
    referenceId: `gift:${g.id}:${randomUUID()}`,
    requestId: randomUUID(),
  });
  return { ...order, amount };
}
