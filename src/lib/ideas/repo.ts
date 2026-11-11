import { getDb } from "@/lib/db";

export type SearchRecord = { text: string; mode: string; where: string; createdAt: Date };
export const MAX_SEARCH_CHARS = 1000;

/** Remembers what a visitor asked the concierge, so "Give me an idea" can build on it. */
export async function recordSearch(userId: string, s: { text: string; mode: string; where?: string }): Promise<void> {
  const text = s.text.trim().slice(0, MAX_SEARCH_CHARS);
  if (!text) return;
  await (await getDb()).query("INSERT INTO searches (user_id, text, mode, where_text) VALUES ($1, $2, $3, $4)", [userId, text, s.mode, (s.where ?? "").trim().slice(0, 100)]);
}

/** A visitor's most recent searches, newest first. */
export async function recentSearches(userId: string, limit = 15): Promise<SearchRecord[]> {
  const { rows } = await (await getDb()).query<{ text: string; mode: string; where_text: string; created_at: Date }>(
    "SELECT text, mode, where_text, created_at FROM searches WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2",
    [userId, limit],
  );
  return rows.map((r) => ({ text: r.text, mode: r.mode, where: r.where_text, createdAt: new Date(r.created_at) }));
}
