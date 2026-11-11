// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST as createOrder } from "@/app/api/paypal/orders/route";
import { POST as authorize } from "@/app/api/paypal/orders/[orderId]/authorize/route";
import { POST as capture } from "@/app/api/paypal/authorizations/[authorizationId]/capture/route";
import { POST as voidAuth } from "@/app/api/paypal/authorizations/[authorizationId]/void/route";
import { resetTokenCache } from "@/lib/paypal/client";
import { GET as idToken } from "@/app/api/paypal/id-token/route";
import { mockPayPal, pp, setPayPalEnv, verifyPayPalCall } from "../../helpers/paypal";

const ADMIN = "admin-secret-123";
const SANDBOX = "https://api-m.sandbox.paypal.com";
const UUID = /^[0-9a-f-]{36}$/;

const post = (body?: unknown, headers: Record<string, string> = {}) =>
  new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
const params = <K extends string>(key: K, value: string) => ({ params: Promise.resolve({ [key]: value } as Record<K, string>) });

async function verifyResponse(res: Response, expected: { status: number; body: Record<string, unknown> }) {
  expect(res.status).toBe(expected.status);
  expect(await res.json()).toMatchObject(expected.body);
}

const goodOrder = { experienceId: "carasau-pasta-bar", partySize: 2 };

beforeEach(() => { setPayPalEnv(); vi.stubEnv("ADMIN_API_KEY", ADMIN); resetTokenCache(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("POST /api/paypal/orders", () => {
  it("happy: prices on the server, holds the total, returns the order and quote", async () => {
    const f = mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.order() });
    await verifyResponse(await createOrder(post(goodOrder)), {
      status: 201,
      body: { id: "5O190127TN364715T", status: "CREATED", quote: { experienceId: "carasau-pasta-bar", partySize: 2, total: "180.00", currency: "USD" } },
    });
    const sent = JSON.parse((f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(sent.intent).toBe("AUTHORIZE");
    expect(sent.purchase_units[0].amount).toEqual({ currency_code: "USD", value: "180.00" });
    expect(sent.purchase_units[0].description).toBe("Carasau Pasta Bar · 2 guests");
    expect(sent.purchase_units[0].reference_id).toMatch(/^carasau-pasta-bar:[0-9a-f-]{36}$/);
    const key = new Headers((f.mock.calls[1] as unknown as [string, RequestInit])[1].headers).get("paypal-request-id");
    expect(key).toMatch(UUID);
  });
  it("accepts the { kind, itemId } form for partners", async () => {
    const f = mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.order() });
    await verifyResponse(await createOrder(post({ kind: "partner", itemId: "vibrato-grill-jazz", partySize: 2 })), { status: 201, body: { quote: { total: "70.00" } } });
    expect(JSON.parse((f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string).purchase_units[0].amount.value).toBe("70.00");
  });
  it("prices a live venue from Google on the server", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "g");
    const f = mockPayPal(
      { status: 200, body: { id: "ChIJ1", displayName: { text: "Barbusa" }, primaryType: "italian_restaurant", location: { latitude: 1, longitude: 2 } } },
      { status: 200, body: pp.token() },
      { status: 201, body: pp.order() },
    );
    await verifyResponse(await createOrder(post({ kind: "live", itemId: "gp:ChIJ1", partySize: 3 })), { status: 201, body: { quote: { total: "148.00", description: "Barbusa · 3 guests (request)" } } });
    expect(JSON.parse((f.mock.calls[2] as unknown as [string, RequestInit])[1].body as string).purchase_units[0].amount.value).toBe("148.00");
  });
  it("404 for a live venue Google doesn't know", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "g");
    mockPayPal({ status: 404, body: { error: { status: "NOT_FOUND", message: "x" } } });
    await verifyResponse(await createOrder(post({ kind: "live", itemId: "gp:ChIJnope", partySize: 2 })), { status: 404, body: { error: "Place not found" } });
  });
  it("400 for an unknown kind", async () => {
    await verifyResponse(await createOrder(post({ kind: "voucher", itemId: "carasau-pasta-bar", partySize: 2 })), { status: 400, body: { error: "Kind must be partner or live" } });
  });
  it("ignores an amount sent by the browser", async () => {
    const f = mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.order() });
    await createOrder(post({ ...goodOrder, amount: "0.01", currency: "EUR" }));
    expect(JSON.parse((f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string).purchase_units[0].amount).toEqual({ currency_code: "USD", value: "180.00" });
  });
  it("accepts partySize as a numeric string", async () => {
    mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.order() });
    expect((await createOrder(post({ experienceId: "carasau-pasta-bar", partySize: "3" }))).status).toBe(201);
  });
  it.each([
    ["missing experienceId", { partySize: 2 }, 400, "Experience id is required"],
    ["non-string experienceId", { experienceId: 7, partySize: 2 }, 400, "Experience id is required"],
    ["missing partySize", { experienceId: "carasau-pasta-bar" }, 400, "Party size must be a whole number from 1 to 20"],
    ["party too big for the venue", { experienceId: "desuar-hollywood-spa", partySize: 3 }, 400, "Party size for DESUAR HOLLYWOOD SPA must be from 1 to 2"],
    ["unknown experience", { experienceId: "nope", partySize: 2 }, 404, "Experience not found: nope"],
  ])("%s -> %i", async (_l, body, status, error) => {
    const f = mockPayPal();
    await verifyResponse(await createOrder(post(body)), { status, body: { error } });
    expect(f).not.toHaveBeenCalled();
  });
  it.each([["invalid JSON", "{nope"], ["a JSON array", "[]"], ["JSON null", "null"], ["no body", undefined]])("400 on %s", async (_l, raw) => {
    await verifyResponse(await createOrder(post(raw)), { status: 400, body: { error: "Body must be a JSON object" } });
  });
  it("503 when PayPal keys are missing", async () => {
    setPayPalEnv({ PAYPAL_CLIENT_SECRET: undefined });
    await verifyResponse(await createOrder(post(goodOrder)), { status: 503, body: { error: "PayPal credentials are not configured" } });
  });
  it("503 when PAYPAL_ENV is invalid", async () => {
    setPayPalEnv({ PAYPAL_ENV: "prod" });
    await verifyResponse(await createOrder(post(goodOrder)), { status: 503, body: { error: "PAYPAL_ENV must be sandbox or live" } });
  });
  it("passes PayPal 4xx through with issue and debug id", async () => {
    mockPayPal({ status: 200, body: pp.token() }, { status: 422, body: pp.error("UNPROCESSABLE_ENTITY", "Nope.", "dbg-1") });
    await verifyResponse(await createOrder(post(goodOrder)), { status: 422, body: { issue: "UNPROCESSABLE_ENTITY", debugId: "dbg-1" } });
  });
  it("maps PayPal 5xx to 502", async () => {
    mockPayPal({ status: 200, body: pp.token() }, { status: 503, body: pp.error("SERVICE_UNAVAILABLE", "Down.") });
    await verifyResponse(await createOrder(post(goodOrder)), { status: 502, body: { issue: "SERVICE_UNAVAILABLE" } });
  });
  it("500 with a generic message when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await verifyResponse(await createOrder(post(goodOrder)), { status: 500, body: { error: "Unexpected error" } });
    expect(spy).toHaveBeenCalled();
  });
  it("500 when something throws a non-Error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw "boom"; }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await verifyResponse(await createOrder(post(goodOrder)), { status: 500, body: { error: "Unexpected error" } });
  });
});

describe("POST /api/paypal/orders/:orderId/authorize", () => {
  it("happy: returns the authorization (hold) details", async () => {
    mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.authorizedOrder() });
    await verifyResponse(await authorize(post(), params("orderId", "5O190127TN364715T")), { status: 200, body: { authorizationId: "0AW2184448108334S", status: "CREATED", expiresAt: "2026-12-12T21:20:49Z" } });
  });
  it("400 on an unsafe order id", async () => {
    await verifyResponse(await authorize(post(), params("orderId", "../x")), { status: 400, body: { error: "Order id has invalid characters" } });
  });
  it("422 when the buyer hasn't approved yet", async () => {
    mockPayPal({ status: 200, body: pp.token() }, { status: 422, body: pp.error("ORDER_NOT_APPROVED", "Not approved.") });
    await verifyResponse(await authorize(post(), params("orderId", "ABC")), { status: 422, body: { issue: "ORDER_NOT_APPROVED" } });
  });
  it("does not require the admin key (buyer-facing)", async () => {
    mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.authorizedOrder() });
    expect((await authorize(post(), params("orderId", "ABC"))).status).toBe(200);
  });
});

describe.each([
  ["capture", capture, { status: 201, body: pp.capture() }, { captureId: "7TK53561YB803214S", status: "COMPLETED" }],
  ["void", voidAuth, { status: 204 }, { authorizationId: "AUTH1", status: "VOIDED" }],
] as const)("POST /api/paypal/authorizations/:id/%s", (action, handler, paypalResponse, expected) => {
  it(`happy: admin can ${action}`, async () => {
    const f = mockPayPal({ status: 200, body: pp.token() }, paypalResponse);
    await verifyResponse(await handler(post(undefined, { "x-admin-key": ADMIN }), params("authorizationId", "AUTH1")), { status: 200, body: expected });
    verifyPayPalCall(f, 1, { method: "POST", url: `${SANDBOX}/v2/payments/authorizations/AUTH1/${action}` });
  });

  describe("access control", () => {
    it("401 without the admin key, and PayPal is never called", async () => {
      const f = mockPayPal();
      await verifyResponse(await handler(post(), params("authorizationId", "AUTH1")), { status: 401, body: { error: "Admin key required" } });
      expect(f).not.toHaveBeenCalled();
    });
    it("401 with a wrong key of the same length", async () => {
      await verifyResponse(await handler(post(undefined, { "x-admin-key": "admin-secret-999" }), params("authorizationId", "AUTH1")), { status: 401, body: { error: "Admin key required" } });
    });
    it("401 with a wrong key of a different length", async () => {
      await verifyResponse(await handler(post(undefined, { "x-admin-key": "x" }), params("authorizationId", "AUTH1")), { status: 401, body: { error: "Admin key required" } });
    });
    it("503 when the server has no admin key configured", async () => {
      vi.stubEnv("ADMIN_API_KEY", "");
      await verifyResponse(await handler(post(undefined, { "x-admin-key": "" }), params("authorizationId", "AUTH1")), { status: 503, body: { error: "Admin key is not configured" } });
    });
  });

  it("400 on an unsafe authorization id", async () => {
    await verifyResponse(await handler(post(undefined, { "x-admin-key": ADMIN }), params("authorizationId", "A B")), { status: 400, body: { error: "Authorization id has invalid characters" } });
  });
});

describe("saving PayPal with a request-to-book hold", () => {
  const gp = { status: 200, body: { id: "ChIJ1", displayName: { text: "Barbusa" }, primaryType: "italian_restaurant", location: { latitude: 1, longitude: 2 } } };
  const sent = (f: ReturnType<typeof vi.fn>) => JSON.parse((f.mock.calls[2] as unknown as [string, RequestInit])[1].body as string);
  beforeEach(() => vi.stubEnv("GOOGLE_PLACES_API_KEY", "g"));
  it("live + savePayPal: asks PayPal to save it, returning to this venue's page", async () => {
    const f = mockPayPal(gp, { status: 200, body: pp.token() }, { status: 201, body: pp.order({ status: "PAYER_ACTION_REQUIRED" }) });
    const res = await createOrder(new Request("https://kickinit.example/api/paypal/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "live", itemId: "gp:ChIJ1", partySize: 2, savePayPal: true }) }));
    expect(res.status).toBe(201);
    expect(sent(f).payment_source.paypal).toEqual({
      attributes: { vault: { store_in_vault: "ON_SUCCESS", usage_type: "MERCHANT", customer_type: "CONSUMER" } },
      experience_context: { return_url: "https://kickinit.example/request/ChIJ1", cancel_url: "https://kickinit.example/request/ChIJ1" },
    });
  });
  it("live without the box ticked: nothing saved", async () => {
    const f = mockPayPal(gp, { status: 200, body: pp.token() }, { status: 201, body: pp.order() });
    await createOrder(post({ kind: "live", itemId: "gp:ChIJ1", partySize: 2, savePayPal: "yes" }));
    expect(sent(f).payment_source).toBeUndefined();
  });
  it("partners never save PayPal (fixed price, nothing can go over)", async () => {
    const f = mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.order() });
    await createOrder(post({ kind: "partner", itemId: "carasau-pasta-bar", partySize: 2, savePayPal: true }));
    expect(JSON.parse((f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string).payment_source).toBeUndefined();
  });
});

describe("GET /api/paypal/id-token", () => {
  const get = (ip = "1.2.3.4") => idToken(new Request("http://x/api/paypal/id-token", { headers: { "x-forwarded-for": ip } }));
  it("returns a fresh id token, never cached", async () => {
    mockPayPal({ status: 200, body: { ...pp.token(), id_token: "eyJ.tok" } });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ idToken: "eyJ.tok" });
  });
  it("a PayPal failure passes its status through", async () => {
    mockPayPal({ status: 401, body: { error: "invalid_client", error_description: "bad" } });
    expect((await get("5.5.5.5")).status).toBe(401);
  });
  it("rate limit: 30 a minute, the 31st is 429", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...pp.token(), id_token: "t" }), { status: 200 })));
    for (let i = 0; i < 30; i++) expect((await get("9.9.9.9")).status).toBe(200);
    expect((await get("9.9.9.9")).status).toBe(429);
  });
});
