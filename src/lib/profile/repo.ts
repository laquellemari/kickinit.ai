import { getDb } from "@/lib/db";
import { BookingError } from "@/lib/bookings/service";

export type Profile = { userId: string; displayName: string; homeCity: string; homeCountry: string; avatar: string | null };
export const DEFAULT_PROFILE = { displayName: "", homeCity: "Los Angeles", homeCountry: "US", avatar: null } as const;
/** About 200 KB of image once base64-encoded. */
export const MAX_AVATAR_CHARS = 280_000;
const AVATAR_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;

type Row = { user_id: string; display_name: string; home_city: string; home_country: string; avatar: string | null };

export async function getProfile(userId: string): Promise<Profile> {
  const { rows } = await (await getDb()).query<Row>("SELECT * FROM profiles WHERE user_id = $1", [userId]);
  const r = rows[0];
  return r ? { userId, displayName: r.display_name, homeCity: r.home_city, homeCountry: r.home_country, avatar: r.avatar } : { userId, ...DEFAULT_PROFILE };
}

export type ProfileUpdate = { displayName?: unknown; homeCity?: unknown; homeCountry?: unknown; avatar?: unknown };

function field(v: unknown, label: string, max: number, required: boolean): string {
  if (typeof v !== "string") throw new BookingError(400, `${label} must be text`);
  const s = v.trim();
  if (required && !s) throw new BookingError(400, `${label} is required`);
  if (s.length > max) throw new BookingError(400, `${label} can be at most ${max} characters`);
  return s;
}

/** Updates only the fields given. `avatar: null` removes the photo. */
export async function saveProfile(userId: string, u: ProfileUpdate): Promise<Profile> {
  const cur = await getProfile(userId);
  const next = { ...cur };
  if (u.displayName !== undefined) next.displayName = field(u.displayName, "Name", 40, false);
  if (u.homeCity !== undefined) next.homeCity = field(u.homeCity, "Home city", 60, true);
  if (u.homeCountry !== undefined) {
    const c = field(u.homeCountry, "Country", 2, true).toUpperCase();
    if (!/^[A-Z]{2}$/.test(c)) throw new BookingError(400, "Country must be a 2-letter code like US");
    next.homeCountry = c;
  }
  if (u.avatar !== undefined) {
    if (u.avatar === null) next.avatar = null;
    else if (typeof u.avatar !== "string" || !AVATAR_RE.test(u.avatar)) throw new BookingError(400, "Profile photo must be a PNG, JPEG or WebP image");
    else if (u.avatar.length > MAX_AVATAR_CHARS) throw new BookingError(400, "Profile photo must be under 200 KB");
    else next.avatar = u.avatar;
  }
  await (await getDb()).query(
    `INSERT INTO profiles (user_id, display_name, home_city, home_country, avatar) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id) DO UPDATE SET display_name = $2, home_city = $3, home_country = $4, avatar = $5, updated_at = now()`,
    [userId, next.displayName, next.homeCity, next.homeCountry, next.avatar],
  );
  return next;
}
