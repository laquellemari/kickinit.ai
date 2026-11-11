// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { createScriptedModel, createNewBooking } from "../../helpers/factories";
import { useTestDb } from "../../helpers/db";
import { recordSearch } from "@/lib/ideas/repo";
import { insertBooking, transition } from "@/lib/bookings/repo";

const runtime = vi.hoisted(() => ({ model: null as unknown, configured: true }));
vi.mock("@/lib/concierge/runtime", () => ({
  conciergeModel: () => { if (!runtime.configured) throw new Error("Concierge is not configured"); return runtime.model; },
}));

const ME = "11111111-1111-4111-8111-111111111111";
let ip = 0;
const { POST: routePOST } = await import("@/app/api/ideas/route");
const load = async () => routePOST;
const post = (POST: (r: Request) => Promise<Response>, body: unknown, o: { cookie?: boolean; ip?: string } = {}) =>
  POST(new Request("http://x/api/ideas", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": o.ip ?? `10.1.0.${++ip}`, ...(o.cookie === false ? {} : { cookie: `kid=${ME}` }) }, body: typeof body === "string" ? body : JSON.stringify(body) }));

let t: Awaited<ReturnType<typeof useTestDb>>;
beforeAll(async () => { t = await useTestDb(); });
beforeEach(async () => { await t.reset(); runtime.configured = true; });

describe("POST /api/ideas", () => {
  it("happy: ideas built on my searches and live bookings (released ones left out)", async () => {
    const POST = await load();
    await recordSearch(ME, { text: "jazz tonight for two", mode: "you" });
    await recordSearch("someone-else", { text: "secret search", mode: "you" });
    await insertBooking(createNewBooking({ userId: ME, name: "Hugh Spa" }));
    const gone = await insertBooking(createNewBooking({ userId: ME, name: "Declined Place" }));
    await transition(gone.id, ["held"], "declined");
    const { model, prompts } = createScriptedModel([{ text: "Late-night blues in Hollywood\nA sauna Sunday\nRooftop drinks downtown" }]);
    runtime.model = model;
    const res = await post(POST, { mode: "you", where: "Los Angeles, CA" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ideas: ["Late-night blues in Hollywood", "A sauna Sunday", "Rooftop drinks downtown"], personalized: true });
    const seen = JSON.stringify(prompts[0]);
    expect(seen).toContain("jazz tonight for two");
    expect(seen).toContain("Hugh Spa");
    expect(seen).toContain("Los Angeles, CA");
    expect(seen).not.toContain("secret search");
    expect(seen).not.toContain("Declined Place");
  });
  it("defaults to for-you and no area", async () => {
    const POST = await load();
    const { model, prompts } = createScriptedModel([{ text: "An idea" }]);
    runtime.model = model;
    expect((await post(POST, {})).status).toBe(200);
    expect(JSON.stringify(prompts[0])).toContain("planning something for themselves, in or near Los Angeles");
  });
  it("401 without a visitor cookie", async () => {
    expect((await post(await load(), {}, { cookie: false })).status).toBe(401);
  });
  it.each([
    [{ mode: "both" }, "Mode must be you or them"],
    [{ where: 5 }, "Where must be text up to 100 characters"],
    [{ where: "w".repeat(101) }, "Where must be text up to 100 characters"],
  ])("400 %j", async (body, error) => {
    const res = await post(await load(), body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
  });
  it("boundary: where of 100 characters is fine", async () => {
    const POST = await load();
    runtime.model = createScriptedModel([{ text: "An idea" }]).model;
    expect((await post(POST, { where: "w".repeat(100) })).status).toBe(200);
  });
  it("400 when the body isn't JSON", async () => {
    expect((await post(await load(), "nope")).status).toBe(400);
  });
  it("503 when Claude isn't configured", async () => {
    runtime.configured = false;
    const res = await post(await load(), {});
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Concierge is not configured" });
  });
  it("rate limit: 10 a minute, the 11th is 429", async () => {
    const POST = await load();
    for (let i = 0; i < 10; i++) expect((await post(POST, { mode: "x" }, { ip: "9.9.9.9" })).status).toBe(400);
    expect((await post(POST, { mode: "x" }, { ip: "9.9.9.9" })).status).toBe(429);
  });
});
