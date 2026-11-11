// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createHoldOrder, authorizeOrder, captureAuthorization, voidAuthorization, getAccessToken, resetTokenCache, PayPalError, MAX_AMOUNT,
} from "@/lib/paypal/client";
import { mockPayPal, pp, setPayPalEnv, verifyPayPalCall } from "../../../helpers/paypal";

const SANDBOX = "https://api-m.sandbox.paypal.com";
const hold = (o: Partial<Parameters<typeof createHoldOrder>[0]> = {}) =>
  ({ amount: "180.00", currency: "USD", description: "Dinner for 2 at Marea", referenceId: "booking-1", requestId: "req-1", ...o });

beforeEach(() => { setPayPalEnv(); resetTokenCache(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("getAccessToken", () => {
  it("happy: exchanges client credentials for a token", async () => {
    const f = mockPayPal({ status: 200, body: pp.token() });
    expect(await getAccessToken()).toBe("A21-token");
    verifyPayPalCall(f, 0, { method: "POST", url: `${SANDBOX}/v1/oauth2/token`, auth: "basic" });
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].body).toBe("grant_type=client_credentials");
  });
  it("reuses a cached token until shortly before expiry", async () => {
    vi.useFakeTimers();
    const f = mockPayPal({ status: 200, body: pp.token({ expires_in: 120 }) }, { status: 200, body: pp.token({ access_token: "A21-second" }) });
    await getAccessToken();
    vi.advanceTimersByTime(59_000);
    expect(await getAccessToken()).toBe("A21-token");
    expect(f).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1_000); // now within 60s of expiry
    expect(await getAccessToken()).toBe("A21-second");
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("uses the live API when PAYPAL_ENV=live", async () => {
    setPayPalEnv({ PAYPAL_ENV: "live" });
    const f = mockPayPal({ status: 200, body: pp.token() });
    await getAccessToken();
    verifyPayPalCall(f, 0, { method: "POST", url: "https://api-m.paypal.com/v1/oauth2/token" });
  });
  it("defaults to sandbox when PAYPAL_ENV is unset", async () => {
    setPayPalEnv({ PAYPAL_ENV: undefined });
    const f = mockPayPal({ status: 200, body: pp.token() });
    await getAccessToken();
    verifyPayPalCall(f, 0, { method: "POST", url: `${SANDBOX}/v1/oauth2/token` });
  });
  it("validation: missing client id", async () => {
    setPayPalEnv({ PAYPAL_CLIENT_ID: undefined });
    await expect(getAccessToken()).rejects.toThrow("PayPal credentials are not configured");
  });
  it("validation: missing secret", async () => {
    setPayPalEnv({ PAYPAL_CLIENT_SECRET: undefined });
    await expect(getAccessToken()).rejects.toThrow("PayPal credentials are not configured");
  });
  it("validation: unknown PAYPAL_ENV", async () => {
    setPayPalEnv({ PAYPAL_ENV: "staging" });
    await expect(getAccessToken()).rejects.toThrow("PAYPAL_ENV must be sandbox or live");
  });
  it("PayPal rejects the credentials", async () => {
    mockPayPal({ status: 401, body: { error: "invalid_client", error_description: "Client Authentication failed" } });
    await expect(getAccessToken()).rejects.toMatchObject({ name: "PayPalError", status: 401, message: "PayPal auth failed: Client Authentication failed" });
  });
});

describe("createHoldOrder", () => {
  it("happy: creates an AUTHORIZE order with an idempotency key", async () => {
    const f = mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.order() });
    expect(await createHoldOrder(hold())).toEqual({ id: "5O190127TN364715T", status: "CREATED" });
    verifyPayPalCall(f, 1, {
      method: "POST", url: `${SANDBOX}/v2/checkout/orders`, auth: "bearer", requestId: "req-1",
      body: { intent: "AUTHORIZE", purchase_units: [{ reference_id: "booking-1", description: "Dinner for 2 at Marea", amount: { currency_code: "USD", value: "180.00" } }] },
    });
  });

  describe("validation", () => {
    it.each([
      ["non-numeric", "abc", "Amount must be a decimal like 180.00"],
      ["three decimals", "1.005", "Amount must be a decimal like 180.00"],
      ["negative", "-5.00", "Amount must be a decimal like 180.00"],
      ["zero", "0.00", "Amount must be greater than zero"],
      ["over max", "10000.01", `Amount cannot exceed ${MAX_AMOUNT}`],
    ])("rejects %s amount", async (_l, amount, msg) => {
      await expect(createHoldOrder(hold({ amount }))).rejects.toThrow(msg);
    });
    it("rejects a currency that isn't 3 uppercase letters", async () => {
      await expect(createHoldOrder(hold({ currency: "usd" }))).rejects.toThrow("Currency must be a 3-letter code like USD");
    });
    it("rejects an empty description", async () => {
      await expect(createHoldOrder(hold({ description: "  " }))).rejects.toThrow("Description is required");
    });
    it("rejects a description over 127 characters", async () => {
      await expect(createHoldOrder(hold({ description: "x".repeat(128) }))).rejects.toThrow("Description cannot exceed 127 characters");
    });
    it("rejects an empty reference id", async () => {
      await expect(createHoldOrder(hold({ referenceId: "" }))).rejects.toThrow("Reference id is required");
    });
    it("rejects a missing request id", async () => {
      await expect(createHoldOrder(hold({ requestId: "" }))).rejects.toThrow("Request id is required for idempotency");
    });
    it("does not call PayPal when input is invalid", async () => {
      const f = mockPayPal();
      await expect(createHoldOrder(hold({ amount: "0.00" }))).rejects.toThrow();
      expect(f).not.toHaveBeenCalled();
    });
  });

  describe("boundary", () => {
    it.each(["0.01", "1", "9999.99", "10000.00"])("accepts %s", async (amount) => {
      mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.order() });
      await expect(createHoldOrder(hold({ amount }))).resolves.toMatchObject({ id: "5O190127TN364715T" });
    });
    it("accepts a 127-character description", async () => {
      mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.order() });
      await expect(createHoldOrder(hold({ description: "x".repeat(127) }))).resolves.toBeDefined();
    });
  });

  it("surfaces PayPal's error name, message and debug id", async () => {
    mockPayPal({ status: 200, body: pp.token() }, { status: 422, body: pp.error("UNPROCESSABLE_ENTITY", "The requested action could not be performed.", "dbg-9") });
    const err = await createHoldOrder(hold()).catch((e) => e);
    expect(err).toBeInstanceOf(PayPalError);
    expect(err).toMatchObject({ status: 422, issue: "UNPROCESSABLE_ENTITY", debugId: "dbg-9", message: "PayPal UNPROCESSABLE_ENTITY: The requested action could not be performed." });
  });
  it("handles an error response with no JSON body", async () => {
    mockPayPal({ status: 200, body: pp.token() }, { status: 500 });
    await expect(createHoldOrder(hold())).rejects.toMatchObject({ status: 500, issue: "UNKNOWN", message: "PayPal UNKNOWN: HTTP 500" });
  });
});

describe("authorizeOrder", () => {
  it("happy: returns the authorization id, status and expiry", async () => {
    const f = mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.authorizedOrder() });
    expect(await authorizeOrder("5O190127TN364715T", "req-2")).toEqual({
      orderId: "5O190127TN364715T", authorizationId: "0AW2184448108334S", status: "CREATED", expiresAt: "2026-12-12T21:20:49Z",
      amount: { value: "180.00", currency: "USD" },
    });
    verifyPayPalCall(f, 1, { method: "POST", url: `${SANDBOX}/v2/checkout/orders/5O190127TN364715T/authorize`, auth: "bearer", requestId: "req-2", body: {} });
  });
  it("returns a null amount when PayPal omits it", async () => {
    mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.authorizedOrder({ amount: undefined }) });
    expect((await authorizeOrder("X", "r")).amount).toBeNull();
  });
  it("validation: rejects an empty order id", async () => {
    await expect(authorizeOrder("", "r")).rejects.toThrow("Order id is required");
  });
  it("validation: rejects an order id with unsafe characters", async () => {
    await expect(authorizeOrder("../admin", "r")).rejects.toThrow("Order id has invalid characters");
  });
  it("boundary: 36-character id is accepted, 37 is rejected", async () => {
    mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.authorizedOrder() });
    await expect(authorizeOrder("A".repeat(36), "r")).resolves.toBeDefined();
    await expect(authorizeOrder("A".repeat(37), "r")).rejects.toThrow("Order id has invalid characters");
  });
  it("throws when PayPal returns no authorization", async () => {
    mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: { id: "X", status: "COMPLETED", purchase_units: [{}] } });
    await expect(authorizeOrder("X", "r")).rejects.toThrow("PayPal returned no authorization for order X");
  });
  it("surfaces a buyer-not-approved error", async () => {
    mockPayPal({ status: 200, body: pp.token() }, { status: 422, body: pp.error("ORDER_NOT_APPROVED", "Payer has not yet approved the Order for payment.") });
    await expect(authorizeOrder("X", "r")).rejects.toMatchObject({ status: 422, issue: "ORDER_NOT_APPROVED" });
  });
});

describe("captureAuthorization", () => {
  it("happy: final capture of the full amount", async () => {
    const f = mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.capture() });
    expect(await captureAuthorization("0AW2184448108334S", "req-3")).toEqual({ captureId: "7TK53561YB803214S", status: "COMPLETED" });
    verifyPayPalCall(f, 1, { method: "POST", url: `${SANDBOX}/v2/payments/authorizations/0AW2184448108334S/capture`, auth: "bearer", requestId: "req-3", body: { final_capture: true } });
  });
  it("captures a partial amount when given", async () => {
    const f = mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: pp.capture() });
    await captureAuthorization("AUTH1", "req-4", { value: "50.00", currency: "USD" });
    verifyPayPalCall(f, 1, { method: "POST", url: `${SANDBOX}/v2/payments/authorizations/AUTH1/capture`, body: { final_capture: true, amount: { value: "50.00", currency_code: "USD" } } });
  });
  it("validation: rejects an invalid partial amount", async () => {
    await expect(captureAuthorization("AUTH1", "r", { value: "0", currency: "USD" })).rejects.toThrow("Amount must be greater than zero");
  });
  it("validation: rejects an empty authorization id", async () => {
    await expect(captureAuthorization("", "r")).rejects.toThrow("Authorization id is required");
  });
  it("reads the specific issue from details[] like real PayPal 422s", async () => {
    mockPayPal({ status: 200, body: pp.token() }, { status: 422, body: { name: "UNPROCESSABLE_ENTITY", message: "The requested action could not be performed.", debug_id: "d1", details: [{ issue: "AUTHORIZATION_ALREADY_CAPTURED" }] } });
    await expect(captureAuthorization("AUTH1", "r")).rejects.toMatchObject({ issue: "AUTHORIZATION_ALREADY_CAPTURED", message: "PayPal AUTHORIZATION_ALREADY_CAPTURED: The requested action could not be performed." });
  });
  it("surfaces an expired authorization", async () => {
    mockPayPal({ status: 200, body: pp.token() }, { status: 422, body: pp.error("AUTHORIZATION_EXPIRED", "The authorization has expired.") });
    await expect(captureAuthorization("AUTH1", "r")).rejects.toMatchObject({ issue: "AUTHORIZATION_EXPIRED" });
  });
});

describe("voidAuthorization", () => {
  it("happy: 204 No Content means voided", async () => {
    const f = mockPayPal({ status: 200, body: pp.token() }, { status: 204 });
    expect(await voidAuthorization("AUTH1", "req-5")).toEqual({ authorizationId: "AUTH1", status: "VOIDED" });
    verifyPayPalCall(f, 1, { method: "POST", url: `${SANDBOX}/v2/payments/authorizations/AUTH1/void`, auth: "bearer", requestId: "req-5" });
  });
  it("happy: 200 with a body also means voided", async () => {
    mockPayPal({ status: 200, body: pp.token() }, { status: 200, body: { id: "AUTH1", status: "VOIDED" } });
    expect(await voidAuthorization("AUTH1", "req-5")).toEqual({ authorizationId: "AUTH1", status: "VOIDED" });
  });
  it("validation: rejects an authorization id with unsafe characters", async () => {
    await expect(voidAuthorization("AUTH 1", "r")).rejects.toThrow("Authorization id has invalid characters");
  });
  it("surfaces an already-captured authorization", async () => {
    mockPayPal({ status: 200, body: pp.token() }, { status: 422, body: pp.error("CANNOT_BE_VOIDED", "A reauthorization cannot be voided.") });
    await expect(voidAuthorization("AUTH1", "r")).rejects.toMatchObject({ status: 422, issue: "CANNOT_BE_VOIDED" });
  });
});
