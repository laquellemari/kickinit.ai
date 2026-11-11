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
CREATE INDEX IF NOT EXISTS bookings_user ON bookings (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_status ON bookings (status, created_at DESC);
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
