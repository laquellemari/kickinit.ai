// @vitest-environment node
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { createScriptedModel } from "../../helpers/factories";

const runtime = vi.hoisted(() => ({ model: null as unknown, configured: true }));
vi.mock("@/lib/concierge/runtime", () => ({
  conciergeModel: () => { if (!runtime.configured) throw new Error("Concierge is not configured"); return runtime.model; },
  paypalTools: () => ({}),
}));

const { POST } = await import("@/app/api/concierge/route");

let ip = 0;
const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request("http://localhost/api/concierge", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `10.0.0.${++ip}`, ...headers }, body: JSON.stringify(body) }));

beforeEach(() => { runtime.configured = true; });
afterEach(() => vi.restoreAllMocks());

describe("POST /api/concierge", () => {
  it("happy: returns the reply and server-priced options", async () => {
    runtime.model = createScriptedModel([{ tool: "present_options", args: { intro: "Try these.", partySize: 2, picks: [{ experienceId: "blue-room", why: "Late jazz." }] } }]).model;
    const res = await post({ message: "jazz tonight for 2" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reply).toBe("Try these.");
    expect(body.options[0]).toMatchObject({ experience: { id: "blue-room" }, quote: { total: "70.00" }, why: "Late jazz." });
  });
  it("defaults mode to 'you'", async () => {
    const { model, prompts } = createScriptedModel([{ text: "ok" }]);
    runtime.model = model;
    await post({ message: "hi" });
    expect(JSON.stringify(prompts[0])).not.toContain("GIFT");
  });
  it("400 on invalid input, without calling the model", async () => {
    const { model, prompts } = createScriptedModel([]);
    runtime.model = model;
    const res = await post({ message: "", mode: "you" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Message is required" });
    expect(prompts).toHaveLength(0);
  });
  it("400 on a non-JSON body", async () => {
    const res = await POST(new Request("http://localhost/api/concierge", { method: "POST", body: "nope", headers: { "x-forwarded-for": "10.9.9.9" } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Body must be a JSON object" });
  });
  it("503 when the Anthropic key isn't set", async () => {
    runtime.configured = false;
    const res = await post({ message: "hi" });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Concierge is not configured" });
  });
  it("502 with a friendly message when Claude fails", async () => {
    runtime.model = createScriptedModel([]).model; // throws on first call
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ message: "hi" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/having trouble/);
  });
  describe("access control: rate limit", () => {
    it("allows 20 requests a minute per IP, the 21st gets 429", async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 21; i++) {
        runtime.model = createScriptedModel([{ text: "ok" }]).model;
        statuses.push((await post({ message: "hi" }, { "x-forwarded-for": "9.9.9.9" })).status);
      }
      expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
      expect(statuses[20]).toBe(429);
    });
  });
});
