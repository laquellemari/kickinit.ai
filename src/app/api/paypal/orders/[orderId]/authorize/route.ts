import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeOrder } from "@/lib/paypal/client";
import { toResponse } from "@/lib/paypal/http";

/** After the buyer approves in PayPal, place the hold. */
export async function POST(_req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    return NextResponse.json(await authorizeOrder(orderId, randomUUID()));
  } catch (err) {
    return toResponse(err);
  }
}
