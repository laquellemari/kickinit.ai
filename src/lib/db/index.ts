import { Pool } from "pg";

/** The subset of a Postgres client we use. Satisfied by pg's Pool and by PGlite in tests. */
export type Db = { query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }> };

let db: Db | null = null;
let ready: Promise<void> | null = null;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS bookings (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('partner', 'live')),
  item_id          TEXT NOT NULL,
  name             TEXT NOT NULL,
  party_size       INTEGER NOT NULL CHECK (party_size BETWEEN 1 AND 20),
  starts_at        TIMESTAMPTZ NOT NULL,
  amount           TEXT NOT NULL,
  currency         TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('held', 'confirmed', 'declined', 'failed')),
  paypal_order_id  TEXT NOT NULL UNIQUE,
  authorization_id TEXT NOT NULL,
  capture_id       TEXT,
  hold_expires_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS country TEXT NOT NULL DEFAULT '';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS neighborhood TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cuisine TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS local_hour INTEGER NOT NULL DEFAULT 12;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS bookings_user ON bookings (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_status ON bookings (status, created_at DESC);

CREATE TABLE IF NOT EXISTS gifts (
  id             TEXT PRIMARY KEY,
  organizer_id   TEXT NOT NULL,
  organizer_name TEXT NOT NULL,
  experience_id  TEXT NOT NULL,
  name           TEXT NOT NULL,
  party_size     INTEGER NOT NULL CHECK (party_size BETWEEN 1 AND 20),
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),
  currency       TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  note           TEXT NOT NULL DEFAULT '',
  mode           TEXT NOT NULL CHECK (mode IN ('solo', 'pool')),
  status         TEXT NOT NULL CHECK (status IN ('open', 'funded', 'redeemed', 'expired')),
  deadline       TIMESTAMPTZ NOT NULL,
  redeem_code    TEXT NOT NULL UNIQUE,
  booking_id     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gifts_open_deadline ON gifts (status, deadline);

CREATE TABLE IF NOT EXISTS contributions (
  id               TEXT PRIMARY KEY,
  gift_id          TEXT NOT NULL REFERENCES gifts(id),
  contributor_id   TEXT NOT NULL,
  name             TEXT NOT NULL,
  amount_cents     INTEGER NOT NULL CHECK (amount_cents > 0),
  status           TEXT NOT NULL CHECK (status IN ('held', 'captured', 'voided')),
  paypal_order_id  TEXT NOT NULL UNIQUE,
  authorization_id TEXT NOT NULL,
  capture_id       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contributions_gift ON contributions (gift_id, created_at);
CREATE INDEX IF NOT EXISTS contributions_contributor ON contributions (contributor_id);
CREATE INDEX IF NOT EXISTS gifts_organizer ON gifts (organizer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS profiles (
  user_id      TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  home_city    TEXT NOT NULL DEFAULT 'Los Angeles',
  home_country TEXT NOT NULL DEFAULT 'US',
  avatar       TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE profiles ALTER COLUMN home_city SET DEFAULT 'Los Angeles';

CREATE TABLE IF NOT EXISTS searches (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  text        TEXT NOT NULL,
  mode        TEXT NOT NULL,
  where_text  TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS searches_user ON searches (user_id, created_at DESC);
`;

/** Use a specific database (tests pass PGlite). Resets schema readiness. */
export function setDb(next: Db | null): void {
  db = next;
  ready = null;
}

/** The app database, with the schema created on first use. */
export async function getDb(): Promise<Db> {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("Database is not configured");
    db = new Pool({ connectionString: url, max: 5 });
  }
  if (!ready) {
    const current = db;
    ready = current.query(SCHEMA).then(() => undefined).catch((err) => {
      ready = null;
      throw err;
    });
  }
  await ready;
  return db;
}
