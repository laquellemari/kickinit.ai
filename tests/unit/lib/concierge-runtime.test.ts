// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { conciergeModel, paypalTools, liveSearch, eventSearch, DEFAULT_MODEL } from "@/lib/concierge/runtime";
import { generateText } from "ai";
import { searchLivePlaces } from "@/lib/places/client";
import { createLimiter, clientKey } from "@/lib/concierge/rate-limit";

afterEach(() => vi.unstubAllEnvs());

describe("conciergeModel", () => {
  it("throws when the Anthropic key is missing", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(() => conciergeModel()).toThrow("Concierge is not configured");
  });
  it("uses the default model, or CONCIERGE_MODEL when set", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.stubEnv("CONCIERGE_MODEL", "");
    expect(conciergeModel().modelId).toBe(DEFAULT_MODEL);
    vi.stubEnv("CONCIERGE_MODEL", "claude-haiku-5-5");
    expect(conciergeModel().modelId).toBe("claude-haiku-5-5");
  });
});

describe("the request actually sent to Anthropic", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("never includes temperature (current Claude models reject it), even when a caller sets one", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.stubEnv("CONCIERGE_MODEL", "");
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string));
      return new Response(JSON.stringify({
        id: "msg_1", type: "message", role: "assistant", model: DEFAULT_MODEL,
        content: [{ type: "text", text: "hi" }], stop_reason: "end_turn", stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }));
    const r1 = await generateText({ model: conciergeModel(), prompt: "hello" });
    await generateText({ model: conciergeModel(), prompt: "hello", temperature: 0.7 });
    expect(r1.text).toBe("hi");
    expect(bodies).toHaveLength(2);
    for (const b of bodies) {
      expect(b).not.toHaveProperty("temperature");
      expect(b.model).toBe(DEFAULT_MODEL);
    }
  });
});

describe("paypalTools", () => {
  it("is empty without PayPal credentials", () => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "s");
    expect(paypalTools()).toEqual({});
  });
  it("is empty while the client id is the 'pending' placeholder", () => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "pending");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "pending");
    expect(paypalTools()).toEqual({});
  });
  it("is empty without a secret", () => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "");
    expect(paypalTools()).toEqual({});
  });
  it.each(["sandbox", "live"])("exposes only the read-only get_order tool (%s)", (env) => {
    vi.stubEnv("PAYPAL_CLIENT_ID", "id");
    vi.stubEnv("PAYPAL_CLIENT_SECRET", "secret");
    vi.stubEnv("PAYPAL_ENV", env);
    expect(Object.keys(paypalTools())).toEqual(["get_order"]);
  });
});

describe("rate limiter", () => {
  it("allows up to the limit per window, then blocks, then resets", () => {
    const l = createLimiter({ limit: 2, windowMs: 1000 });
    expect(l.take("a", 0)).toBe(true);
    expect(l.take("a", 10)).toBe(true);
    expect(l.take("a", 20)).toBe(false);
    expect(l.take("b", 20)).toBe(true); // separate key
    expect(l.take("a", 999)).toBe(false); // window - 1
    expect(l.take("a", 1000)).toBe(true); // exactly the window resets
  });
  it("defaults now to Date.now()", () => {
    expect(createLimiter({ limit: 1, windowMs: 1000 }).take("k")).toBe(true);
  });
  it("keys on the first forwarded IP, else anonymous", () => {
    expect(clientKey(new Request("http://x", { headers: { "x-forwarded-for": " 1.2.3.4 , 5.6.7.8" } }))).toBe("1.2.3.4");
    expect(clientKey(new Request("http://x"))).toBe("anonymous");
  });
});

describe("liveSearch", () => {
  it("is off without a Google key", () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
    expect(liveSearch()).toBeUndefined();
  });
  it("uses Google Places when the key is set", () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "g");
    expect(liveSearch()).toBe(searchLivePlaces);
  });
});

describe("eventSearch", () => {
  it("is off without a Ticketmaster key", () => {
    vi.stubEnv("TICKETMASTER_API_KEY", "");
    expect(eventSearch()).toBeUndefined();
  });
  it("searches Ticketmaster when the key is set", async () => {
    vi.stubEnv("TICKETMASTER_API_KEY", "tm");
    const f = vi.fn(async () => new Response(JSON.stringify({})));
    vi.stubGlobal("fetch", f);
    expect(await eventSearch()!({ keyword: "runtime-check" })).toEqual([]);
    expect(String((f.mock.calls[0] as unknown as [URL])[0])).toContain("app.ticketmaster.com");
    vi.unstubAllGlobals();
  });
});
