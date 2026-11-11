// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GET as list } from "@/app/api/experiences/route";
import { GET as one } from "@/app/api/experiences/[id]/route";

const get = (qs = "") => list(new Request(`http://localhost/api/experiences${qs}`));
async function verifyList(res: Response, expected: { status: number; check?: (r: { id: string; category: string; tags: string[]; city: string; total: string; distanceKm?: number }[]) => void; error?: string }) {
  expect(res.status).toBe(expected.status);
  const body = await res.json();
  if (expected.error) return expect(body.error).toBe(expected.error);
  expect(body.count).toBe(body.results.length);
  expected.check?.(body.results);
}

describe("GET /api/experiences", () => {
  it("happy: returns up to 20 results by default", async () => {
    await verifyList(await get(), { status: 200, check: (r) => expect(r).toHaveLength(20) });
  });
  it("filters by category, tags, text, party and budget together", async () => {
    await verifyList(await get("?category=culinary&tags=italian,mexican&q=italian&partySize=2&maxTotal=200"), {
      status: 200,
      check: (r) => { expect(r.map((x) => x.id).sort()).toEqual(["carasau-pasta-bar", "trattoria-daly"]); expect(r.find((x) => x.id === "carasau-pasta-bar")!.total).toBe("180.00"); },
    });
  });
  it("geo search near downtown LA within 3 km, nearest first", async () => {
    await verifyList(await get("?lat=34.0522&lng=-118.2437&radiusKm=3"), {
      status: 200,
      check: (r) => { expect(r.length).toBeGreaterThan(0); expect(r.every((x) => x.distanceKm! <= 3)).toBe(true); expect(r[0].distanceKm).toBeLessThanOrEqual(r[r.length - 1].distanceKm!); },
    });
  });
  it("limit and blank params are handled", async () => {
    await verifyList(await get("?limit=3&category=&maxTotal="), { status: 200, check: (r) => expect(r).toHaveLength(3) });
  });
  it("empty tags list is ignored", async () => {
    await verifyList(await get("?tags=,,&limit=1"), { status: 200, check: (r) => expect(r).toHaveLength(1) });
  });
  it.each([
    ["?lat=25&lng=-80", "lat, lng and radiusKm must be given together"],
    ["?category=sports", "Unknown category: sports"],
    ["?partySize=abc", "Party size must be a whole number from 1 to 20"],
    ["?limit=500", "Limit must be a whole number from 1 to 50"],
    ["?lat=95&lng=0&radiusKm=1", "Latitude must be between -90 and 90"],
  ])("400 for %s", async (qs, error) => {
    await verifyList(await get(qs), { status: 400, error });
  });
});

describe("GET /api/experiences/:id", () => {
  it("returns the experience", async () => {
    const res = await one(new Request("http://localhost"), { params: Promise.resolve({ id: "vibrato-grill-jazz" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "vibrato-grill-jazz", name: "Vibrato Grill Jazz", category: "nightlife" });
  });
  it("404 for an unknown id", async () => {
    const res = await one(new Request("http://localhost"), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Experience not found: nope" });
  });
});
