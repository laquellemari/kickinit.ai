import questData from "../../../data/quests.json";
import type { Booking, Quest, QuestProgress, Requirement, UserContext } from "./types";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** 1970-01-05 was a Monday; weeks are counted Monday to Sunday (UTC). */
const MONDAY_EPOCH = Date.UTC(1970, 0, 5);

export const ALL_QUESTS: readonly Quest[] = questData.quests as Quest[];

/** A booking counts toward the user's own quests only once it was paid, attended and booked in the app. */
export function countsForSelf(b: Booking): boolean {
  return b.status === "captured" && b.checkedIn && b.source === "in_app" && !b.isGift;
}

/** A gift counts toward the giver once it was paid in the app; the recipient's check-in isn't required. */
export function countsAsGift(b: Booking): boolean {
  return b.status === "captured" && b.source === "in_app" && b.isGift;
}

export function matchesFilter(filter: string, b: Booking, ctx: UserContext): boolean {
  switch (filter) {
    case "evening": return b.localHour >= 19;
    case "late": return b.localHour >= 22 || b.localHour < 5;
    case "early": return b.localHour >= 5 && b.localHour < 8;
    case "duo": return b.partySize === 2;
    case "party4": return b.partySize >= 4;
    case "home_city": return b.city === ctx.homeCity;
    case "traveling": return b.city !== ctx.homeCity;
    case "international": return b.country !== ctx.homeCountry;
    case "last_minute": return b.startsAt.getTime() - b.bookedAt.getTime() <= 48 * HOUR_MS;
    default: return b.tags.includes(filter); // e.g. sunset, pasta, sushi, dumpling
  }
}

function validate(r: Requirement): void {
  if (!["count", "distinct", "same", "weekly_streak", "gift"].includes(r.type)) {
    throw new Error(`Unknown requirement type: ${r.type}`);
  }
  if (!Number.isInteger(r.count) || r.count <= 0) throw new Error("Requirement count must be a positive integer");
  if (r.window_days !== null && !(r.window_days > 0)) throw new Error("Window must be a positive number of days");
  if ((r.type === "distinct" || r.type === "same") && !r.attribute) throw new Error(`${r.type} requirement needs an attribute`);
  if (r.type === "gift" && !r.filter) throw new Error("gift requirement needs a filter");
}

/** Most bookings that fit inside any window of `days` (start inclusive, end exclusive). */
function bestWindow(bookings: Booking[], days: number): number {
  const t = bookings.map((b) => b.startsAt.getTime()).sort((a, b) => a - b);
  const span = days * DAY_MS;
  let best = 0;
  for (let i = 0, j = 0; i < t.length; i++) {
    while (t[i] - t[j] >= span) j++;
    best = Math.max(best, i - j + 1);
  }
  return best;
}

export function longestWeeklyStreak(bookings: Booking[]): number {
  const weeks = [...new Set(bookings.map((b) => Math.floor((b.startsAt.getTime() - MONDAY_EPOCH) / (7 * DAY_MS))))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < weeks.length; i++) {
    run = i > 0 && weeks[i] === weeks[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

function rawProgress(r: Requirement, bookings: Booking[], ctx: UserContext): number {
  if (r.type === "gift") {
    return bookings.filter((b) => countsAsGift(b) && b.tags.includes(r.filter!)).length;
  }

  const matching = bookings.filter(
    (b) => countsForSelf(b) && b.tags.some((t) => r.tags.includes(t)) && (!r.filter || matchesFilter(r.filter, b, ctx)),
  );

  switch (r.type) {
    case "count":
      return r.window_days === null ? matching.length : bestWindow(matching, r.window_days);
    case "distinct":
      return new Set(matching.map((b) => b[r.attribute!]).filter((v) => v !== undefined)).size;
    case "same": {
      const tally = new Map<string, number>();
      for (const b of matching) {
        const v = b[r.attribute!];
        if (v !== undefined) tally.set(v, (tally.get(v) ?? 0) + 1);
      }
      return Math.max(0, ...tally.values());
    }
    default: // weekly_streak
      return longestWeeklyStreak(matching);
  }
}

export function evaluateQuest(quest: Quest, bookings: Booking[], ctx: UserContext): QuestProgress {
  const r = quest.requirement;
  validate(r);
  const current = Math.min(rawProgress(r, bookings, ctx), r.count);
  return { questId: quest.id, current, target: r.count, complete: current >= r.count, progress: current / r.count };
}

export function evaluateAllQuests(bookings: Booking[], ctx: UserContext, quests: readonly Quest[] = ALL_QUESTS): QuestProgress[] {
  return quests.map((q) => evaluateQuest(q, bookings, ctx));
}
