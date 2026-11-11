import { NextResponse } from "next/server";
import { readJson, toResponse } from "@/lib/paypal/http";
import { getProfile, saveProfile } from "@/lib/profile/repo";
import { visitorId } from "@/lib/visitor";

export async function GET(req: Request) {
  try {
    return NextResponse.json(await getProfile(visitorId(req)));
  } catch (err) {
    return toResponse(err);
  }
}

/** { displayName?, homeCity?, homeCountry?, avatar? (data URL, or null to remove) } */
export async function PUT(req: Request) {
  try {
    const userId = visitorId(req);
    const b = await readJson(req);
    return NextResponse.json(await saveProfile(userId, { displayName: b.displayName, homeCity: b.homeCity, homeCountry: b.homeCountry, avatar: b.avatar }));
  } catch (err) {
    return toResponse(err);
  }
}
