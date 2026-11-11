import { randomBytes, randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";

export type GiftStatus = "open" | "funded" | "redeemed" | "expired";
export type Gift = {
  id: string; organizerId: string; organizerName: string; experienceId: string; name: string; partySize: number;
  amountCents: number; currency: string; recipientName: string; note: string; mode: "solo" | "pool"; status: GiftStatus;
  deadline: Date; redeemCode: string; bookingId: string | null; createdAt: Date;
};
export type NewGift = Omit<Gift, "id" | "status" | "redeemCode" | "bookingId" | "createdAt">;

export type ContributionStatus = "held" | "captured" | "voided";
export type Contribution = {
  id: string; giftId: string; contributorId: string; name: string; amountCents: number; status: ContributionStatus;
  paypalOrderId: string; authorizationId: string; captureId: string | null; createdAt: Date;
};
export type NewContribution = Omit<Contribution, "id" | "status" | "captureId" | "createdAt">;

type GiftRow = {
  id: string; organizer_id: string; organizer_name: string; experience_id: string; name: string; party_size: number; amount_cents: number;
  currency: string; recipient_name: string; note: string; mode: Gift["mode"]; status: GiftStatus; deadline: Date; redeem_code: string;
  booking_id: string | null; created_at: Date;
};
type ContribRow = {
  id: string; gift_id: string; contributor_id: string; name: string; amount_cents: number; status: ContributionStatus;
  paypal_order_id: string; authorization_id: string; capture_id: string | null; created_at: Date;
};

const gift = (r: GiftRow): Gift => ({
  id: r.id, organizerId: r.organizer_id, organizerName: r.organizer_name, experienceId: r.experience_id, name: r.name, partySize: r.party_size,
  amountCents: r.amount_cents, currency: r.currency, recipientName: r.recipient_name, note: r.note, mode: r.mode, status: r.status,
  deadline: new Date(r.deadline), redeemCode: r.redeem_code, bookingId: r.booking_id, createdAt: new Date(r.created_at),
});
const contribution = (r: ContribRow): Contribution => ({
  id: r.id, giftId: r.gift_id, contributorId: r.contributor_id, name: r.name, amountCents: r.amount_cents, status: r.status,
  paypalOrderId: r.paypal_order_id, authorizationId: r.authorization_id, captureId: r.capture_id, createdAt: new Date(r.created_at),
});

export async function insertGift(g: NewGift): Promise<Gift> {
  const db = await getDb();
  const { rows } = await db.query<GiftRow>(
    `INSERT INTO gifts (id, organizer_id, organizer_name, experience_id, name, party_size, amount_cents, currency, recipient_name, note, mode, status, deadline, redeem_code)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'open',$12,$13) RETURNING *`,
    [randomUUID(), g.organizerId, g.organizerName, g.experienceId, g.name, g.partySize, g.amountCents, g.currency, g.recipientName, g.note, g.mode, g.deadline,
      randomBytes(16).toString("base64url")],
  );
  return gift(rows[0]);
}

export async function getGift(id: string): Promise<Gift | null> {
  const { rows } = await (await getDb()).query<GiftRow>("SELECT * FROM gifts WHERE id = $1", [id]);
  return rows[0] ? gift(rows[0]) : null;
}

export async function getGiftByCode(code: string): Promise<Gift | null> {
  const { rows } = await (await getDb()).query<GiftRow>("SELECT * FROM gifts WHERE redeem_code = $1", [code]);
  return rows[0] ? gift(rows[0]) : null;
}

/** Atomic status change; null if the gift wasn't in an allowed state. */
export async function transitionGift(id: string, from: GiftStatus[], to: GiftStatus, bookingId: string | null = null): Promise<Gift | null> {
  const { rows } = await (await getDb()).query<GiftRow>(
    `UPDATE gifts SET status = $3, booking_id = COALESCE($4, booking_id), updated_at = now()
     WHERE id = $1 AND status = ANY($2::text[]) RETURNING *`,
    [id, from, to, bookingId],
  );
  return rows[0] ? gift(rows[0]) : null;
}

export async function openGiftsPastDeadline(now: Date): Promise<Gift[]> {
  const { rows } = await (await getDb()).query<GiftRow>("SELECT * FROM gifts WHERE status = 'open' AND deadline <= $1 ORDER BY deadline LIMIT 100", [now]);
  return rows.map(gift);
}

export async function insertContribution(c: NewContribution): Promise<Contribution> {
  const { rows } = await (await getDb()).query<ContribRow>(
    `INSERT INTO contributions (id, gift_id, contributor_id, name, amount_cents, status, paypal_order_id, authorization_id)
     VALUES ($1,$2,$3,$4,$5,'held',$6,$7) RETURNING *`,
    [randomUUID(), c.giftId, c.contributorId, c.name, c.amountCents, c.paypalOrderId, c.authorizationId],
  );
  return contribution(rows[0]);
}

export async function getContributionByOrder(orderId: string): Promise<Contribution | null> {
  const { rows } = await (await getDb()).query<ContribRow>("SELECT * FROM contributions WHERE paypal_order_id = $1", [orderId]);
  return rows[0] ? contribution(rows[0]) : null;
}

export async function listContributions(giftId: string): Promise<Contribution[]> {
  const { rows } = await (await getDb()).query<ContribRow>("SELECT * FROM contributions WHERE gift_id = $1 ORDER BY created_at, id", [giftId]);
  return rows.map(contribution);
}

export async function setContributionStatus(id: string, from: ContributionStatus, to: ContributionStatus, captureId: string | null = null): Promise<boolean> {
  const { rows } = await (await getDb()).query(
    "UPDATE contributions SET status = $3, capture_id = COALESCE($4, capture_id) WHERE id = $1 AND status = $2 RETURNING id",
    [id, from, to, captureId],
  );
  return rows.length === 1;
}
