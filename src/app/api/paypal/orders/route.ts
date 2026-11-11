import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { priceFor } from "@/lib/bookings/pricing";
import { createHoldOrder } from "@/lib/paypal/client";
import { readJson, toResponse } from "@/lib/paypal/http";

/**
 * Create a PayPal order that will hold (not charge) the buyer's funds.
 * Body: { kind: "partner" | "live", itemId, partySize } (or the older { experienceId, partySize }).
 * The price is looked up on the server; any amount sent is ignored.
 */
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
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
