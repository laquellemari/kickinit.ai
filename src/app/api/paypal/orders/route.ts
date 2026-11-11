import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { quote } from "@/lib/catalog/catalog";
import { createHoldOrder } from "@/lib/paypal/client";
import { readJson, toResponse } from "@/lib/paypal/http";

/**
 * Create a PayPal order that will hold (not charge) the buyer's funds.
 * Body: { experienceId, partySize }. The price is looked up on the server; any amount sent is ignored.
 */
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    if (typeof body.experienceId !== "string" || !body.experienceId) throw new Error("Experience id is required");
    const q = quote(body.experienceId, Number(body.partySize));
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
