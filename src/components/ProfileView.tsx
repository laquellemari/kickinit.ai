"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { PublicBooking } from "@/lib/bookings/public";
import type { Passport } from "@/lib/passport/passport";
import type { Profile } from "@/lib/profile/repo";
import { guests, money } from "@/lib/format";

export function CalendarLoading() {
  return <div className="concierge-status" role="status"><span className="dot-pulse" aria-hidden="true" /> Loading your calendar…</div>;
}

const PlansCalendar = dynamic(() => import("./PlansCalendar"), { ssr: false, loading: CalendarLoading });

const MAX_SIDE = 256;

/** Shrinks a chosen photo to at most 256px and JPEG, so it fits the 200 KB limit. */
export async function toAvatarDataUrl(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Choose a PNG, JPEG or WebP image");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export function ProfileView({ now = new Date() }: { now?: Date }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [passport, setPassport] = useState<Passport | null>(null);
  const [bookings, setBookings] = useState<PublicBooking[]>([]);
  const [draft, setDraft] = useState({ displayName: "", homeCity: "", homeCountry: "" });
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    Promise.all([fetch("/api/profile"), fetch("/api/passport"), fetch("/api/bookings")])
      .then(async ([p, pp, b]) => {
        if (!p.ok || !pp.ok || !b.ok) throw new Error("load");
        const prof: Profile = await p.json();
        setProfile(prof);
        setDraft({ displayName: prof.displayName, homeCity: prof.homeCity, homeCountry: prof.homeCountry });
        setPassport(await pp.json());
        setBookings((await b.json()).bookings);
      })
      .catch(() => setLoadError("Couldn't load your dashboard. Reload to try again."));
  }, []);

  async function save(body: Record<string, unknown>, ok: string) {
    setMsg(null);
    const res = await fetch("/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) return setMsg({ kind: "error", text: json.error ?? "Couldn't save." });
    setProfile(json);
    setMsg({ kind: "ok", text: ok });
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    try {
      await save({ avatar: await toAvatarDataUrl(file) }, "Photo updated.");
    } catch (err) {
      setMsg({ kind: "error", text: (err as Error).message });
    }
  }

  if (loadError) return <p className="error-note" role="alert">{loadError}</p>;
  if (!profile || !passport) return <div className="concierge-status" role="status"><span className="dot-pulse" aria-hidden="true" /> Loading your dashboard…</div>;

  const upcoming = bookings.filter((b) => new Date(b.startsAt) >= now && (b.status === "confirmed" || b.status === "held")).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const initial = (profile.displayName || "You").charAt(0).toUpperCase();
  const lvl = passport.level;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <section className="concierge-card" aria-label="You" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          {profile.avatar
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={profile.avatar} alt="Your profile photo" style={{ width: 96, height: 96, borderRadius: 999, objectFit: "cover", border: "3px solid var(--sun)" }} />
            : <span aria-hidden="true" className="avatar" style={{ width: 96, height: 96, fontSize: 40 }}>{initial}</span>}
          <label className="btn-line" style={{ cursor: "pointer" }}>
            Change photo
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onPhoto(e.target.files?.[0])} style={{ position: "absolute", width: 1, height: 1, opacity: 0 }} />
          </label>
          {profile.avatar && <button type="button" className="text-btn" onClick={() => save({ avatar: null }, "Photo removed.")}>Remove photo</button>}
        </div>
        <div style={{ flex: "1 1 260px", minWidth: 0 }}>
          <h2 className="display" style={{ margin: 0, fontSize: 40 }}>{profile.displayName || "Your dashboard"}</h2>
          <p className="pick-meta" style={{ margin: "4px 0 10px" }}>Level {lvl.level} · {lvl.title} · {lvl.xp.toLocaleString()} XP</p>
          <div role="progressbar" aria-label="Progress to next level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(lvl.progressToNext * 100)} style={{ height: 10, background: "var(--sky)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${Math.round(lvl.progressToNext * 100)}%`, height: "100%", background: "var(--sun)" }} />
          </div>
          <p className="pick-meta" style={{ margin: "6px 0 0" }}>{lvl.nextLevelXp === null ? "Top level reached." : `${(lvl.nextLevelXp - lvl.xp).toLocaleString()} XP to the next level`}</p>
        </div>
        <dl className="fact-list" style={{ flex: "2 1 360px" }}>
          <div><dt>Attended</dt><dd>{passport.stats.attended}</dd></div>
          <div><dt>Gifts sent</dt><dd>{passport.stats.giftsSent}</dd></div>
          <div><dt>Cities</dt><dd>{passport.stats.cities}</dd></div>
          <div><dt>Quests</dt><dd>{passport.stats.questsCompleted} / {passport.stats.questsTotal}</dd></div>
          <div><dt>Badges</dt><dd>{passport.stats.badgesUnlocked} / {passport.stats.badgesTotal}</dd></div>
        </dl>
      </section>

      <section className="concierge-card" aria-label="My plans">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <h2 className="display" style={{ margin: 0, fontSize: 32 }}>My plans</h2>
          <Link href="/passport" className="caps" style={{ fontWeight: 600 }}>Open your passport</Link>
        </div>
        {upcoming.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }} aria-label="Upcoming">
            {upcoming.slice(0, 5).map((b) => (
              <li key={b.id} className="pick-price">
                <Link href={`/booking/${b.id}`}>{b.name}</Link>
                <span className="pick-meta">
                  {new Date(b.startsAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {guests(b.partySize)} · {money(b.amount)}{b.status === "held" ? " on hold" : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="concierge-reply">Nothing booked yet. <Link href="/">Plan something</Link>.</p>
        )}
        <PlansCalendar bookings={bookings} now={now} />
      </section>

      <form
        className="concierge-card"
        aria-label="Settings"
        onSubmit={(e) => { e.preventDefault(); void save(draft, "Settings saved."); }}
      >
        <h2 className="display" style={{ margin: 0, fontSize: 32 }}>Settings</h2>
        <div className="fields" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          <label className="field" style={{ border: "1px solid var(--line)" }}><span>Name</span><input value={draft.displayName} maxLength={40} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} /></label>
          <label className="field" style={{ border: "1px solid var(--line)" }}><span>Home city</span><input value={draft.homeCity} maxLength={60} onChange={(e) => setDraft({ ...draft, homeCity: e.target.value })} /></label>
          <label className="field" style={{ border: "1px solid var(--line)" }}><span>Country</span><input value={draft.homeCountry} maxLength={2} onChange={(e) => setDraft({ ...draft, homeCountry: e.target.value })} /></label>
        </div>
        <p className="pick-meta" style={{ margin: 0 }}>Your home city decides which quests count as travel.</p>
        <button type="submit" className="btn-navy" style={{ alignSelf: "flex-start" }}>Save settings</button>
      </form>
      {msg && <p role={msg.kind === "error" ? "alert" : "status"} className={msg.kind === "error" ? "error-note" : "pick-meta"}>{msg.text}</p>}
    </div>
  );
}
