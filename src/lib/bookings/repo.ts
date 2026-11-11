import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import type { VenueFacts } from "./venue";

export type BookingStatus = "held" | "confirmed" | "declined" | "failed";
export type Booking = {
  id: string;
  userId: string;
  kind: "partner" | "live";
  itemId: string;
  name: string;
  partySize: number;
  startsAt: Date;
  amount: string;
  currency: string;
  status: BookingStatus;
  paypalOrderId: string;
  authorizationId: string;
  captureId: string | null;
  holdExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** Where/when facts used for quests. */
  facts: VenueFacts;
  checkedInAt: Date | null;
  /** Request-to-book: kickinit's booking fee inside the hold. */
  fee: string | null;
  /** Request-to-book: the guest's saved PayPal, if they agreed to be charged for anything above the hold. Never sent to the browser. */
  vaultId: string | null;
  /** Set once the venue closes the bill. */
  settlement: Settlement | null;
  /** When the PayPal hold was renewed (once, after its 3-day guarantee). */
  reauthorizedAt: Date | null;
};
export type OverageStatus = "none" | "charged" | "pay_at_table";
export type Settlement = { billTotal: string; capturedTotal: string; overage: string; overageStatus: OverageStatus; overageCaptureId: string | null; settledAt: Date };
export type NewBooking = Omit<Booking, "id" | "status" | "captureId" | "createdAt" | "updatedAt" | "checkedInAt" | "fee" | "vaultId" | "settlement" | "reauthorizedAt"> &
  { fee?: string | null; vaultId?: string | null };

type Row = {
  id: string; user_id: string; kind: Booking["kind"]; item_id: string; name: string; party_size: number; starts_at: Date | string;
  amount: string; currency: string; status: BookingStatus; paypal_order_id: string; authorization_id: string; capture_id: string | null;
  hold_expires_at: Date | string | null; created_at: Date | string; updated_at: Date | string;
  tags: string[]; city: string; country: string; neighborhood: string | null; cuisine: string | null; local_hour: number; checked_in_at: Date | string | null;
  fee: string | null; vault_id: string | null; bill_total: string | null; captured_total: string | null; overage: string | null;
  overage_status: OverageStatus | null; overage_capture_id: string | null; settled_at: Date | string | null;
  reauthorized_at: Date | string | null;
};

const toDate = (v: Date | string) => new Date(v);
const fromRow = (r: Row): Booking => ({
  id: r.id, userId: r.user_id, kind: r.kind, itemId: r.item_id, name: r.name, partySize: r.party_size, startsAt: toDate(r.starts_at),
  amount: r.amount, currency: r.currency, status: r.status, paypalOrderId: r.paypal_order_id, authorizationId: r.authorization_id,
  captureId: r.capture_id, holdExpiresAt: r.hold_expires_at === null ? null : toDate(r.hold_expires_at), createdAt: toDate(r.created_at), updatedAt: toDate(r.updated_at),
  facts: { tags: r.tags, city: r.city, country: r.country, neighborhood: r.neighborhood, cuisine: r.cuisine, localHour: r.local_hour },
  checkedInAt: r.checked_in_at === null ? null : toDate(r.checked_in_at),
  fee: r.fee, vaultId: r.vault_id,
  reauthorizedAt: r.reauthorized_at === null ? null : toDate(r.reauthorized_at),
  settlement: r.settled_at === null ? null : {
    billTotal: r.bill_total!, capturedTotal: r.captured_total!, overage: r.overage!, overageStatus: r.overage_status!,
    overageCaptureId: r.overage_capture_id, settledAt: toDate(r.settled_at),
  },
});

export async function insertBooking(b: NewBooking): Promise<Booking> {
  const db = await getDb();
  const { rows } = await db.query<Row>(
    `INSERT INTO bookings (id, user_id, kind, item_id, name, party_size, starts_at, amount, currency, status, paypal_order_id, authorization_id, hold_expires_at,
       tags, city, country, neighborhood, cuisine, local_hour, fee, vault_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'held',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
    [randomUUID(), b.userId, b.kind, b.itemId, b.name, b.partySize, b.startsAt, b.amount, b.currency, b.paypalOrderId, b.authorizationId, b.holdExpiresAt,
      b.facts.tags, b.facts.city, b.facts.country, b.facts.neighborhood, b.facts.cuisine, b.facts.localHour, b.fee ?? null, b.vaultId ?? null],
  );
  return fromRow(rows[0]);
}

export async function getBooking(id: string): Promise<Booking | null> {
  const db = await getDb();
  const { rows } = await db.query<Row>("SELECT * FROM bookings WHERE id = $1", [id]);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function getBookingByOrder(paypalOrderId: string): Promise<Booking | null> {
  const db = await getDb();
  const { rows } = await db.query<Row>("SELECT * FROM bookings WHERE paypal_order_id = $1", [paypalOrderId]);
  return rows[0] ? fromRow(rows[0]) : null;
}

/**
 * Moves a booking from one of `from` to `to` atomically. Returns null when the booking
 * isn't in an allowed state (e.g. a second confirm racing the first).
 */
export async function transition(id: string, from: BookingStatus[], to: BookingStatus, captureId: string | null = null): Promise<Booking | null> {
  const db = await getDb();
  const { rows } = await db.query<Row>(
    `UPDATE bookings SET status = $3, capture_id = COALESCE($4, capture_id), updated_at = now()
     WHERE id = $1 AND status = ANY($2::text[]) RETURNING *`,
    [id, from, to, captureId],
  );
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function listBookings(filter: { userId?: string; status?: BookingStatus; limit?: number } = {}): Promise<Booking[]> {
  const db = await getDb();
  const { rows } = await db.query<Row>(
    `SELECT * FROM bookings
     WHERE ($1::text IS NULL OR user_id = $1) AND ($2::text IS NULL OR status = $2)
     ORDER BY created_at DESC LIMIT $3`,
    [filter.userId ?? null, filter.status ?? null, Math.min(Math.max(filter.limit ?? 50, 1), 200)],
  );
  return rows.map(fromRow);
}

/** Marks a confirmed booking as attended. Null if it isn't confirmed or was already checked in. */
export async function markCheckedIn(id: string, at: Date): Promise<Booking | null> {
  const { rows } = await (await getDb()).query<Row>(
    "UPDATE bookings SET checked_in_at = $2, updated_at = now() WHERE id = $1 AND status = 'confirmed' AND checked_in_at IS NULL RETURNING *",
    [id, at],
  );
  return rows[0] ? fromRow(rows[0]) : null;
}

/** Records how the bill was paid. Once only: null if the booking was already settled or isn't confirmed. */
export async function settleBooking(id: string, s: Omit<Settlement, "settledAt">, captureId: string, at: Date): Promise<Booking | null> {
  const { rows } = await (await getDb()).query<Row>(
    `UPDATE bookings SET bill_total = $2, captured_total = $3, overage = $4, overage_status = $5, overage_capture_id = $6, capture_id = $7, settled_at = $8, updated_at = now()
     WHERE id = $1 AND status = 'confirmed' AND settled_at IS NULL RETURNING *`,
    [id, s.billTotal, s.capturedTotal, s.overage, s.overageStatus, s.overageCaptureId, captureId, at],
  );
  return rows[0] ? fromRow(rows[0]) : null;
}

/** The hold was renewed: PayPal gave it a new authorization id. */
export async function setReauthorized(id: string, authorizationId: string, holdExpiresAt: Date | null, at: Date): Promise<Booking> {
  const { rows } = await (await getDb()).query<Row>(
    "UPDATE bookings SET authorization_id = $2, hold_expires_at = COALESCE($3, hold_expires_at), reauthorized_at = $4, updated_at = now() WHERE id = $1 RETURNING *",
    [id, authorizationId, holdExpiresAt, at],
  );
  return fromRow(rows[0]);
}
