import { randomUUID } from "node:crypto";
import { BookingError } from "@/lib/bookings/service";
import { getDb } from "@/lib/db";
import { paypalGet, paypalPost } from "@/lib/paypal/client";
import { MEMBERSHIP_PRICE } from "@/lib/pricing/fees";

/**
 * kickinit membership: $9.99 a month through PayPal Subscriptions. Members pay no concierge fee.
 * The PayPal product and plan are created on first use and remembered.
 */
export type Membership = { userId: string; subscriptionId: string; status: string; checkedAt: Date; createdAt: Date };

/** How long a stored ACTIVE status is trusted before asking PayPal again (cancellations made on paypal.com show up after this). */
export const RECHECK_HOURS = 12;
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const planKey = () => `membership_plan:${process.env.PAYPAL_ENV || "sandbox"}`;

type Row = { user_id: string; subscription_id: string; status: string; checked_at: Date | string; created_at: Date | string };
const fromRow = (r: Row): Membership => ({ userId: r.user_id, subscriptionId: r.subscription_id, status: r.status, checkedAt: new Date(r.checked_at), createdAt: new Date(r.created_at) });

export async function getMembership(userId: string): Promise<Membership | null> {
  const { rows } = await (await getDb()).query<Row>("SELECT * FROM memberships WHERE user_id = $1", [userId]);
  return rows[0] ? fromRow(rows[0]) : null;
}

async function saveMembership(userId: string, subscriptionId: string, status: string, now: Date): Promise<Membership> {
  const { rows } = await (await getDb()).query<Row>(
    `INSERT INTO memberships (user_id, subscription_id, status, checked_at) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET subscription_id = EXCLUDED.subscription_id, status = EXCLUDED.status, checked_at = EXCLUDED.checked_at
     RETURNING *`,
    [userId, subscriptionId, status, now],
  );
  return fromRow(rows[0]);
}

/** Our monthly plan's PayPal id, creating the product and plan the first time. */
export async function ensurePlan(): Promise<string> {
  const db = await getDb();
  const found = await db.query<{ value: string }>("SELECT value FROM app_settings WHERE key = $1", [planKey()]);
  if (found.rows[0]) return found.rows[0].value;
  const product = await paypalPost<{ id: string }>("/v1/catalogs/products", `kickinit-product-${randomUUID()}`, {
    name: "kickinit membership", description: "No concierge fees on kickinit bookings", type: "SERVICE", category: "SOFTWARE",
  });
  const plan = await paypalPost<{ id: string }>("/v1/billing/plans", `kickinit-plan-${randomUUID()}`, {
    product_id: product!.id,
    name: "kickinit membership, monthly",
    description: `$${MEMBERSHIP_PRICE} a month: no concierge fee on any booking`,
    status: "ACTIVE",
    billing_cycles: [{
      frequency: { interval_unit: "MONTH", interval_count: 1 }, tenure_type: "REGULAR", sequence: 1, total_cycles: 0,
      pricing_scheme: { fixed_price: { value: MEMBERSHIP_PRICE, currency_code: "USD" } },
    }],
    payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 1 },
  });
  // Two first visitors at once: keep whichever plan was saved first.
  await db.query("INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING", [planKey(), plan!.id]);
  const saved = await db.query<{ value: string }>("SELECT value FROM app_settings WHERE key = $1", [planKey()]);
  return saved.rows[0].value;
}

/** Start a subscription for this visitor. The browser's PayPal button then asks them to approve it. */
export async function startSubscription(userId: string, origin: string): Promise<{ subscriptionId: string }> {
  const current = await getMembership(userId);
  if (current?.status === "ACTIVE") throw new BookingError(409, "You're already a member");
  const planId = await ensurePlan();
  const sub = await paypalPost<{ id: string }>("/v1/billing/subscriptions", `kickinit-sub-${randomUUID()}`, {
    plan_id: planId,
    custom_id: userId,
    application_context: {
      brand_name: "kickinit", shipping_preference: "NO_SHIPPING", user_action: "SUBSCRIBE_NOW",
      return_url: `${origin}/membership`, cancel_url: `${origin}/membership`,
    },
  });
  return { subscriptionId: sub!.id };
}

type Sub = { id: string; status: string; plan_id: string; custom_id?: string };

/** After the buyer approves: check with PayPal that it's our plan, for this visitor, and active, then save it. */
export async function activateSubscription(userId: string, subscriptionId: unknown, now: Date = new Date()): Promise<Membership> {
  if (typeof subscriptionId !== "string" || !ID_RE.test(subscriptionId)) throw new BookingError(400, "Subscription id is missing or invalid");
  const sub = (await paypalGet<Sub>(`/v1/billing/subscriptions/${subscriptionId}`))!;
  if (sub.custom_id !== userId) throw new BookingError(403, "This subscription belongs to someone else");
  if (sub.plan_id !== (await ensurePlan())) throw new BookingError(400, "That isn't a kickinit membership");
  if (sub.status !== "ACTIVE" && sub.status !== "APPROVED") throw new BookingError(409, `PayPal says this subscription is ${sub.status.toLowerCase()}`);
  return saveMembership(userId, subscriptionId, sub.status, now);
}

/** Members pay no concierge fee. A stored status older than RECHECK_HOURS is refreshed from PayPal first. */
export async function isMember(userId: string, now: Date = new Date()): Promise<boolean> {
  const m = await getMembership(userId);
  if (!m || (m.status !== "ACTIVE" && m.status !== "APPROVED")) return false;
  if (now.getTime() - m.checkedAt.getTime() < RECHECK_HOURS * 3_600_000) return true;
  try {
    const sub = (await paypalGet<Sub>(`/v1/billing/subscriptions/${m.subscriptionId}`))!;
    await saveMembership(userId, m.subscriptionId, sub.status, now);
    return sub.status === "ACTIVE" || sub.status === "APPROVED";
  } catch (err) {
    // PayPal unreachable: trust the last answer rather than charging a member a fee.
    console.warn("Couldn't refresh the membership with PayPal:", err);
    return true;
  }
}

/** Cancel at PayPal (no more monthly charges) and stop the member pricing. */
export async function cancelMembership(userId: string, now: Date = new Date()): Promise<Membership> {
  const m = await getMembership(userId);
  if (!m || (m.status !== "ACTIVE" && m.status !== "APPROVED")) throw new BookingError(404, "You don't have an active membership");
  await paypalPost(`/v1/billing/subscriptions/${m.subscriptionId}/cancel`, `kickinit-cancel-${m.subscriptionId}`, { reason: "Cancelled from kickinit" });
  return saveMembership(userId, m.subscriptionId, "CANCELLED", now);
}
