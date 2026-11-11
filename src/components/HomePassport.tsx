"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Passport } from "@/lib/passport/passport";

const TILTS = ["-8deg", "6deg", "-3deg", "4deg"];

/** The visitor's real passport on the home page: level, XP and up to four stamps (collected first, then closest to done). */
export function HomePassport() {
  const [p, setP] = useState<Passport | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/passport")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then(setP)
      .catch(() => setFailed(true));
  }, []);

  const stamps = p
    ? [
        ...p.completed.map((q) => ({ id: q.id, title: q.title, label: "Collected", done: true })),
        ...p.inProgress.map((q) => ({ id: q.id, title: q.title, label: `${q.current} of ${q.target}`, done: false })),
      ].slice(0, 4)
    : [];

  return (
    <section className="passport" aria-label="Your passport">
      <div style={{ flex: "1 1 220px" }}>
        <h2 className="display" style={{ margin: 0, fontSize: 40, color: "var(--sun)" }}>Your passport</h2>
        <div style={{ fontSize: 14, color: "var(--on-navy)", marginTop: 4 }}>
          {p ? `${p.level.title} · ${p.level.xp.toLocaleString("en-US")} XP` : failed ? "Couldn't load your passport." : "Opening…"}
        </div>
        <Link href="/passport" className="caps" style={{ display: "inline-flex", minHeight: 44, alignItems: "center", color: "#fff" }}>
          All {p ? p.stats.questsTotal : 403} stamps
        </Link>
      </div>
      {p && stamps.length === 0 && (
        <p style={{ flex: "2 1 320px", margin: 0, color: "var(--on-navy-2)", fontSize: 16 }}>
          No stamps yet. Book something, check in when you arrive, and your first stamp lands here.
        </p>
      )}
      {stamps.map((s, i) => (
        <Link key={s.id} href="/passport" style={{ textDecoration: "none", display: "flex", justifyContent: "center" }}>
          <span className="passport-stamp" style={{
            borderStyle: s.done ? "solid" : "dashed",
            borderColor: s.done ? "var(--sun)" : "var(--blue)",
            background: s.done ? "var(--sun)" : "transparent",
            color: s.done ? "var(--navy)" : "#fff",
            transform: `rotate(${TILTS[i]})`,
          }}>
            <span className="display" style={{ fontSize: 16, lineHeight: 1 }}>{s.title}</span>
            <span style={{ fontSize: 12, marginTop: 4 }}>{s.label}</span>
          </span>
        </Link>
      ))}
    </section>
  );
}
