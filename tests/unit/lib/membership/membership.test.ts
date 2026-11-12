// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { ensurePlan, startSubscription, activateSubscription, isMember, cancelMembership, getMembership, RECHECK_HOURS } from "@/lib/membership/membership";
import { resetTokenCache } from "@/lib/paypal/client";
import { getDb } from "@/lib/db";
import { useTestDb } from "../../../helpers/db";
import { mockPayPal, pp, setPayPalEnv, verifyPayPalCall } from "../../../helpers/paypal";

const SANDBOX = "https://api-m.sandbox.paypal.com";
const U = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-11-11T12:00:00Z");
const HOUR = 3_600_000;
const sub = (o: Record<string, unknown> = {}) => ({ id: "I-SUB1", status: "ACTIVE", plan_id: "P-PLAN1", custom_id: U, ...o });
const withPlan = async (id = "P-PLAN1") => (await getDb()).query("INSERT INTO app_settings (key, value) VALUES ('membership_plan:sandbox', $1)", [id]);
const activeMember = async (checkedAt = NOW) => {
  await withPlan();
  mockPayPal({ status: 200, body: pp.token() }, { status: 200, body: sub() });
  await activateSubscription(U, "I-SUB1", checkedAt);
  resetTokenCache();
};

let t: Awaited<ReturnType<typeof useTestDb>>;
beforeAll(async () => { t = await useTestDb(); });
beforeEach(async () => { await t.reset(); setPayPalEnv(); resetTokenCache(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("ensurePlan", () => {
  it("first time: creates the product and a $9.99 monthly plan, and remembers it", async () => {
    const f = mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: { id: "PROD-1" } }, { status: 201, body: { id: "P-PLAN1" } });
    expect(await ensurePlan()).toBe("P-PLAN1");
    verifyPayPalCall(f, 1, { method: "POST", url: `${SANDBOX}/v1/catalogs/products`, auth: "bearer" });
    const plan = JSON.parse((f.mock.calls[2] as unknown as [string, RequestInit])[1].body as string);
    expect(plan).toMatchObject({ product_id: "PROD-1", status: "ACTIVE", billing_cycles: [{ frequency: { interval_unit: "MONTH", interval_count: 1 }, total_cycles: 0, pricing_scheme: { fixed_price: { value: "9.99", currency_code: "USD" } } }] });
    const again = mockPayPal();
    expect(await ensurePlan()).toBe("P-PLAN1");
    expect(again).not.toHaveBeenCalled();
  });
  it("if another request saved a plan first, that one wins", async () => {
    mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: { id: "PROD-2" } }, { status: 201, body: { id: "P-LATE" } });
    const db = await getDb();
    const orig = db.query.bind(db);
    vi.spyOn(db, "query").mockImplementation(async (...a: Parameters<typeof db.query>) => {
      if (String(a[0]).startsWith("INSERT INTO app_settings")) await orig("INSERT INTO app_settings (key, value) VALUES ('membership_plan:sandbox', 'P-FIRST') ON CONFLICT DO NOTHING");
      return orig(...a);
    });
    expect(await ensurePlan()).toBe("P-FIRST");
  });
  it("plans are kept per PayPal environment", async () => {
    await withPlan("P-SANDBOX");
    setPayPalEnv({ PAYPAL_ENV: "live" });
    mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: { id: "PROD-L" } }, { status: 201, body: { id: "P-LIVE" } });
    expect(await ensurePlan()).toBe("P-LIVE");
  });
  it("PAYPAL_ENV unset means sandbox", async () => {
    await withPlan("P-SB");
    vi.stubEnv("PAYPAL_ENV", "");
    expect(await ensurePlan()).toBe("P-SB");
  });
});

describe("startSubscription", () => {
  it("creates a subscription for this visitor on our plan, returning to /membership", async () => {
    await withPlan();
    const f = mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: { id: "I-NEW", status: "APPROVAL_PENDING" } });
    expect(await startSubscription(U, "https://kickinit.onrender.com")).toEqual({ subscriptionId: "I-NEW" });
    const body = JSON.parse((f.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ plan_id: "P-PLAN1", custom_id: U, application_context: { return_url: "https://kickinit.onrender.com/membership", user_action: "SUBSCRIBE_NOW", shipping_preference: "NO_SHIPPING" } });
  });
  it("already a member: 409, PayPal not called", async () => {
    await activeMember();
    const f = mockPayPal();
    await expect(startSubscription(U, "https://x")).rejects.toMatchObject({ status: 409, message: "You're already a member" });
    expect(f).not.toHaveBeenCalled();
  });
  it("a cancelled member can join again", async () => {
    await activeMember();
    mockPayPal({ status: 200, body: pp.token() }, { status: 204 });
    await cancelMembership(U, NOW);
    resetTokenCache();
    mockPayPal({ status: 200, body: pp.token() }, { status: 201, body: { id: "I-AGAIN" } });
    expect(await startSubscription(U, "https://x")).toEqual({ subscriptionId: "I-AGAIN" });
  });
});

describe("activateSubscription", () => {
  it.each(["ACTIVE", "APPROVED"])("PayPal says %s for our plan and this visitor: saved", async (status) => {
    await withPlan();
    const f = mockPayPal({ status: 200, body: pp.token() }, { status: 200, body: sub({ status }) });
    expect(await activateSubscription(U, "I-SUB1", NOW)).toMatchObject({ userId: U, subscriptionId: "I-SUB1", status, checkedAt: NOW });
    expect((f.mock.calls[1] as unknown as [string])[0]).toBe(`${SANDBOX}/v1/billing/subscriptions/I-SUB1`);
  });
  it.each([undefined, "", 5, "I-SUB1; drop", "x".repeat(65)])("bad id %j: 400, PayPal not called", async (id) => {
    const f = mockPayPal();
    await expect(activateSubscription(U, id)).rejects.toMatchObject({ status: 400, message: "Subscription id is missing or invalid" });
    expect(f).not.toHaveBeenCalled();
  });
  it("someone else's subscription: 403", async () => {
    await withPlan();
    mockPayPal({ status: 200, body: pp.token() }, { status: 200, body: sub({ custom_id: "someone-else" }) });
    await expect(activateSubscription(U, "I-SUB1")).rejects.toMatchObject({ status: 403, message: "This subscription belongs to someone else" });
    expect(await getMembership(U)).toBeNull();
  });
  it("another plan: 400", async () => {
    await withPlan();
    mockPayPal({ status: 200, body: pp.token() }, { status: 200, body: sub({ plan_id: "P-OTHER" }) });
    await expect(activateSubscription(U, "I-SUB1")).rejects.toMatchObject({ status: 400, message: "That isn't a kickinit membership" });
  });
  it.each(["APPROVAL_PENDING", "CANCELLED", "SUSPENDED"])("not approved (%s): 409", async (status) => {
    await withPlan();
    mockPayPal({ status: 200, body: pp.token() }, { status: 200, body: sub({ status }) });
    await expect(activateSubscription(U, "I-SUB1")).rejects.toMatchObject({ status: 409, message: `PayPal says this subscription is ${status.toLowerCase()}` });
  });
  it("defaults now to the current time", async () => {
    await withPlan();
    mockPayPal({ status: 200, body: pp.token() }, { status: 200, body: sub() });
    expect((await activateSubscription(U, "I-SUB1")).checkedAt.getTime()).toBeGreaterThan(NOW.getTime());
  });
});

describe("isMember", () => {
  it("no membership: false, PayPal not called", async () => {
    const f = mockPayPal();
    expect(await isMember(U, NOW)).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
  it(`boundary: trusted for ${RECHECK_HOURS} hours, then re-checked with PayPal`, async () => {
    await activeMember();
    const f = mockPayPal();
    expect(await isMember(U, new Date(NOW.getTime() + RECHECK_HOURS * HOUR - 1))).toBe(true);
    expect(f).not.toHaveBeenCalled();
    mockPayPal({ status: 200, body: pp.token() }, { status: 200, body: sub({ status: "CANCELLED" }) });
    expect(await isMember(U, new Date(NOW.getTime() + RECHECK_HOURS * HOUR))).toBe(false);
    expect((await getMembership(U))!.status).toBe("CANCELLED");
    expect(await isMember(U, NOW)).toBe(false);
  });
  it("re-checked and still active: true, and the check time moves on", async () => {
    await activeMember();
    const later = new Date(NOW.getTime() + 13 * HOUR);
    mockPayPal({ status: 200, body: pp.token() }, { status: 200, body: sub({ status: "APPROVED" }) });
    expect(await isMember(U, later)).toBe(true);
    expect((await getMembership(U))!.checkedAt).toEqual(later);
  });
  it("PayPal unreachable during a re-check: keep the member pricing, and log it", async () => {
    await activeMember();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockPayPal({ status: 200, body: pp.token() }, { status: 503, body: pp.error("SERVICE_UNAVAILABLE", "Down") });
    expect(await isMember(U, new Date(NOW.getTime() + 13 * HOUR))).toBe(true);
    expect(warn).toHaveBeenCalled();
  });
  it("defaults now to the current time", async () => {
    await activeMember(new Date());
    expect(await isMember(U)).toBe(true);
  });
});

describe("cancelMembership", () => {
  it("cancels at PayPal and stops member pricing", async () => {
    await activeMember();
    const f = mockPayPal({ status: 200, body: pp.token() }, { status: 204 });
    expect(await cancelMembership(U, NOW)).toMatchObject({ status: "CANCELLED" });
    verifyPayPalCall(f, 1, { method: "POST", url: `${SANDBOX}/v1/billing/subscriptions/I-SUB1/cancel`, auth: "bearer", requestId: "kickinit-cancel-I-SUB1", body: { reason: "Cancelled from kickinit" } });
    expect(await isMember(U, NOW)).toBe(false);
  });
  it("not a member (or already cancelled): 404", async () => {
    await expect(cancelMembership(U)).rejects.toMatchObject({ status: 404, message: "You don't have an active membership" });
    await activeMember();
    mockPayPal({ status: 200, body: pp.token() }, { status: 204 });
    await cancelMembership(U);
    await expect(cancelMembership(U)).rejects.toMatchObject({ status: 404 });
  });
  it("PayPal refusing the cancel leaves the membership as it was", async () => {
    await activeMember();
    mockPayPal({ status: 200, body: pp.token() }, { status: 422, body: pp.error("UNPROCESSABLE_ENTITY", "No") });
    await expect(cancelMembership(U)).rejects.toMatchObject({ issue: "UNPROCESSABLE_ENTITY" });
    expect((await getMembership(U))!.status).toBe("ACTIVE");
  });
});
