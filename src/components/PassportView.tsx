"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Passport } from "@/lib/passport/passport";

export function PassportView() {
  const [p, setP] = useState<Passport | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/passport")
      .then(async (r) => { if (!r.ok) throw new Error(); setP(await r.json()); })
      .catch(() => setError("Couldn't load your passport. Reload to try again."));
  }, []);
  if (error) return <p className="error-note" role="alert">{error}</p>;
  if (!p) return <div className="concierge-status" role="status"><span className="dot-pulse" aria-hidden="true" /> Opening your passport…</div>;

  const lvl = p.level;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <section className="passport" aria-label="Level">
        <div style={{ flex: "1 1 260px" }}>
          <h2 className="display" style={{ margin: 0, fontSize: 44, color: "var(--sun)" }}>{lvl.title}</h2>
          <div style={{ color: "var(--on-navy)", marginTop: 4 }}>Level {lvl.level} · {lvl.xp.toLocaleString()} XP</div>
          <div role="progressbar" aria-label="Progress to next level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(lvl.progressToNext * 100)} style={{ height: 10, background: "rgba(255,255,255,.15)", borderRadius: 999, overflow: "hidden", marginTop: 12, maxWidth: 420 }}>
            <div style={{ width: `${Math.round(lvl.progressToNext * 100)}%`, height: "100%", background: "var(--sun)" }} />
          </div>
        </div>
        <dl className="fact-list" style={{ flex: "2 1 380px", color: "#fff" }}>
          {[["Stamps", `${p.stats.questsCompleted} / ${p.stats.questsTotal}`], ["Badges", `${p.stats.badgesUnlocked} / ${p.stats.badgesTotal}`], ["Attended", p.stats.attended], ["Cities", p.stats.cities]].map(([k, v]) => (
            <div key={k as string}><dt style={{ color: "var(--blue)" }}>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      </section>

      {p.stats.attended === 0 && p.stats.giftsSent === 0 && (
        <p className="concierge-reply concierge-card">
          Your passport is empty. <Link href="/">Book something</Link>, check in when you arrive, and your first stamps appear here.
        </p>
      )}

      <section aria-label="Categories">
        <h2 className="display" style={{ margin: "0 0 16px", fontSize: 34 }}>Stamps by category</h2>
        <div className="pick-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 18 }}>
          {p.categories.map((c) => (
            <div key={c.id} className="passport-stamp" aria-label={c.name}
              style={{ width: "auto", height: 140, borderRadius: 12, borderStyle: c.completed ? "solid" : "dashed", borderColor: c.completed ? "var(--sun)" : "var(--blue)", background: c.completed ? "#FFF6DC" : "#fff" }}>
              <span aria-hidden="true" style={{ fontSize: 30 }}>{c.emoji}</span>
              <span className="display" style={{ fontSize: 17 }}>{c.name}</span>
              <span className="pick-meta">{c.completed} / {c.total}</span>
            </div>
          ))}
        </div>
      </section>

      {p.inProgress.length > 0 && (
        <section className="concierge-card" aria-label="In progress">
          <h2 className="display" style={{ margin: 0, fontSize: 30 }}>Almost there</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            {p.inProgress.map((q) => (
              <li key={q.id} aria-label={q.title}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <strong>{q.emoji} {q.title}</strong><span className="pick-meta">{q.current} / {q.target} · {q.xp} XP</span>
                </div>
                <div className="pick-meta">{q.description}</div>
                <div style={{ height: 8, background: "var(--sky)", borderRadius: 999, overflow: "hidden", marginTop: 6 }}>
                  <div style={{ width: `${Math.round((q.current / q.target) * 100)}%`, height: "100%", background: "var(--sun)" }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.completed.length > 0 && (
        <section className="concierge-card" aria-label="Collected">
          <h2 className="display" style={{ margin: 0, fontSize: 30 }}>Collected</h2>
          <div className="tag-row">{p.completed.map((q) => <span key={q.id} className="tag" title={q.description}>{q.emoji} {q.title}</span>)}</div>
        </section>
      )}

      <section aria-label="Badges">
        <h2 className="display" style={{ margin: "0 0 16px", fontSize: 34 }}>Badges</h2>
        <div className="pick-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 16 }}>
          {p.badges.map((b) => (
            <div key={b.id} aria-label={`${b.name}${b.unlocked ? " (unlocked)" : ""}`} title={b.description}
              className="passport-stamp"
              style={{ width: 130, height: 130, borderStyle: b.unlocked ? "solid" : "dashed", borderColor: b.unlocked ? "var(--sun)" : "var(--line)", background: b.unlocked ? "var(--sun)" : "#fff", color: "var(--navy)", opacity: b.unlocked ? 1 : 0.75 }}>
              <span aria-hidden="true" style={{ fontSize: 26 }}>{b.emoji}</span>
              <span className="display" style={{ fontSize: 14, lineHeight: 1 }}>{b.name}</span>
              <span style={{ fontSize: 11 }}>{b.unlocked ? `+${b.xp} XP` : `${b.current} / ${b.target}`}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
