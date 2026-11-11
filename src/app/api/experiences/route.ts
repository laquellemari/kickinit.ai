import { NextResponse } from "next/server";
import { searchExperiences } from "@/lib/catalog/catalog";
import type { SearchParams } from "@/lib/catalog/types";
import { toResponse } from "@/lib/paypal/http";

const num = (v: string | null) => (v === null || v === "" ? undefined : Number(v));

/** GET /api/experiences?q=&category=&tags=a,b&partySize=&maxTotal=&lat=&lng=&radiusKm=&limit= */
export async function GET(req: Request) {
  try {
    const s = new URL(req.url).searchParams;
    const lat = num(s.get("lat"));
    const lng = num(s.get("lng"));
    const radiusKm = num(s.get("radiusKm"));
    const geo = [lat, lng, radiusKm].filter((v) => v !== undefined).length;
    if (geo !== 0 && geo !== 3) throw new Error("lat, lng and radiusKm must be given together");

    const params: SearchParams = {
      q: s.get("q") ?? undefined,
      category: s.get("category") || undefined,
      tags: s.get("tags")?.split(",").map((t) => t.trim()).filter(Boolean),
      partySize: num(s.get("partySize")),
      maxTotal: num(s.get("maxTotal")),
      limit: num(s.get("limit")),
      near: geo === 3 ? { lat: lat!, lng: lng!, radiusKm: radiusKm! } : undefined,
    };
    const results = searchExperiences(params);
    return NextResponse.json({ count: results.length, results });
  } catch (err) {
    return toResponse(err);
  }
}
