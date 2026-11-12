import { PGlite } from "@electric-sql/pglite";
import { setDb, type Db } from "@/lib/db";

/** A fresh in-memory Postgres per test file; call reset() in beforeEach for isolation. */
export async function useTestDb() {
  const pg = new PGlite();
  const db: Db = { query: (text, params) => (params?.length ? pg.query(text, params) : pg.exec(text).then((r) => r.at(-1) ?? { rows: [] })) as never };
  setDb(db);
  return {
    pg,
    reset: async () => {
      setDb(db);
      await pg.exec("DROP TABLE IF EXISTS contributions; DROP TABLE IF EXISTS gifts; DROP TABLE IF EXISTS bookings; DROP TABLE IF EXISTS profiles; DROP TABLE IF EXISTS searches; DROP TABLE IF EXISTS ratings;");
    },
  };
}
