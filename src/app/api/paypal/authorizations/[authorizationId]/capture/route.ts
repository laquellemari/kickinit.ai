import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { captureAuthorization } from "@/lib/paypal/client";
import { requireAdmin, toResponse } from "@/lib/paypal/http";

/** Venue confirmed: charge the held funds. Admin only. */
export async function POST(req: Request, { params }: { params: Promise<{ authorizationId: string }> }) {
  try {
    requireAdmin(req);
    const { authorizationId } = await params;
    return NextResponse.json(await captureAuthorization(authorizationId, randomUUID()));
  } catch (err) {
    return toResponse(err);
  }
}
