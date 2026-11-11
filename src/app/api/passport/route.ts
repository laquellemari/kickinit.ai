import { NextResponse } from "next/server";
import { loadPassport } from "@/lib/passport/load";
import { toResponse } from "@/lib/paypal/http";
import { visitorId } from "@/lib/visitor";

export async function GET(req: Request) {
  try {
    return NextResponse.json(await loadPassport(visitorId(req)));
  } catch (err) {
    return toResponse(err);
  }
}
