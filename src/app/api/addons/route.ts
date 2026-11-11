import { NextResponse } from "next/server";
import { addOnsFor } from "@/lib/addons/channel3";
import { toResponse } from "@/lib/paypal/http";

/** GET /api/addons?experience=still-water → up to 3 physical gifts to pair with it. */
export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("experience") ?? "";
    return NextResponse.json({ addOns: await addOnsFor(id) });
  } catch (err) {
    return toResponse(err);
  }
}
