// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { priceFor } from "@/lib/bookings/pricing";
import { mockPayPal as mockFetch } from "../../../helpers/paypal";

beforeEach(() => vi.stubEnv("GOOGLE_PLACES_API_KEY", "g"));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("priceFor", () => {
  it("partner: catalog price", async () => {
    const r = await priceFor("partner", "carasau-pasta-bar", 2);
    expect(r).toMatchObject({ kind: "partner", name: "Carasau Pasta Bar", quote: { total: "180.00", experienceId: "carasau-pasta-bar" } });
  });
  it("live: looks the place up on Google and prices the estimate server-side", async () => {
    const f = mockFetch({ status: 200, body: { id: "ChIJ1", displayName: { text: "Barbusa" }, primaryType: "italian_restaurant", location: { latitude: 1, longitude: 2 } } });
    const r = await priceFor("live", "gp:ChIJ1", 2);
    expect(r).toMatchObject({ kind: "live", name: "Barbusa", quote: { total: "80.00", experienceId: "gp:ChIJ1" } });
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("https://places.googleapis.com/v1/places/ChIJ1");
  });
  it.each([
    ["bad kind", "other", "carasau-pasta-bar", "Kind must be partner or live"],
    ["missing id", "partner", "", "Item id is required"],
    ["non-string id", "partner", 5, "Item id is required"],
    ["live id without prefix", "live", "ChIJ1", "Live item ids start with gp:"],
    ["unknown partner", "partner", "nope", "Experience not found: nope"],
  ])("rejects %s", async (_l, kind, id, msg) => {
    await expect(priceFor(kind, id, 2)).rejects.toThrow(msg);
  });
});
