import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createHoldOrder } from "@/lib/paypal/client";
import { readJson, toResponse } from "@/lib/paypal/http";

/** Create a PayPal order that will hold (not charge) the buyer's funds. */
export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const order = await createHoldOrder({
      amount: String(body.amount ?? ""),
      currency: String(body.currency ?? "USD"),
      description: String(body.description ?? ""),
      referenceId: String(body.referenceId ?? ""),
      requestId: randomUUID(),
    });
    return NextResponse.json(order, { status: 201 });
  } catch (err) {
    return toResponse(err);
  }
}
