import { NextResponse } from "next/server";
import { closeDuePools } from "@/lib/gifts/service";
import { requireAdmin, toResponse } from "@/lib/paypal/http";

/** Called every 15 minutes by the Render cron job: charge or release pools whose deadline has passed. */
export async function POST(req: Request) {
  try {
    requireAdmin(req);
    return NextResponse.json(await closeDuePools());
  } catch (err) {
    return toResponse(err);
  }
}
