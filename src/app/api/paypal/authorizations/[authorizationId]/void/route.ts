import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { voidAuthorization } from "@/lib/paypal/client";
import { requireAdmin, toResponse } from "@/lib/paypal/http";

/** Venue couldn't confirm: release the hold so the buyer is never charged. Admin only. */
export async function POST(req: Request, { params }: { params: Promise<{ authorizationId: string }> }) {
  try {
    requireAdmin(req);
    const { authorizationId } = await params;
    return NextResponse.json(await voidAuthorization(authorizationId, randomUUID()));
  } catch (err) {
    return toResponse(err);
  }
}
