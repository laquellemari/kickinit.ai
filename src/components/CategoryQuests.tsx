"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CategoryPage } from "@/lib/passport/passport";

type Quest = CategoryPage["quests"][number];
type Filter = "all" | "progress" | "done" | "todo";

const DIFFICULTIES = ["Easy", "Medium", "Hard", "Legendary"] as const;
const MODE: Record<string, string> = { solo: "Solo", duo: "For two", group: "With a group", gift: "A gift" };
const FILTERS: { id: Filter; label: string; test: (q: Quest) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "progress", label: "In progress", test: (q) => !q.complete && q.current > 0 },
  { id: "done", label: "Collected", test: (q) => q.complete },
  { id: "todo", label: "Not started", test: (q) => !q.complete && q.current === 0 },
];

/** One quest: what to do, who it's for, XP and progress. `find` adds a link to search for a match. */
export function QuestCard({ q, find = true }: { q: Quest; find?: boolean }) {
  const pct = Math.round((Math.min(q.current, q.target) / q.target) * 100);
  return (
    <li className={`quest-card${q.complete ? " quest-done" : ""}`} aria-label={q.title}>
      <div className="quest-head">
        <span aria-hidden="true" className="quest-emoji">{q.emoji}</span>
        <div style={{ flex: 1 }}>
          <strong className="quest-title">{q.title}</strong>
          <div className="pick-meta">{MODE[q.mode] ?? q.mode} · {q.xp.toLocaleString("en-US")} XP</div>
        </div>
        {q.complete && <span className="quest-stamp">COLLECTED</span>}
      </div>
      <p className="quest-desc">{q.description}</p>
      <div className="quest-progress">
        <div role="progressbar" aria-label={`${q.title} progress`} aria-valuemin={0} aria-valuemax={q.target} aria-valuenow={Math.min(q.current, q.target)} className="quest-bar">
          <div style={{ width: `${pct}%` }} />
        </div>
        <span className="pick-meta">{Math.min(q.current, q.target)} / {q.target}</span>
      </div>
      {find && !q.complete && (
        <Link className="quest-find" href={`/plan?mode=${q.mode === "gift" ? "them" : "you"}&q=${encodeURIComponent(q.description)}`}>Find something for this →</Link>
      )}
    </li>
  );
}

/** Every quest in one passport category, by difficulty, with this visitor's progress. */
export function CategoryQuests({ id }: { id: string }) {
  const [page, setPage] = useState<CategoryPage | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    fetch(`/api/passport/${id}`)
      .then(async (r) => { if (!r.ok) throw new Error(); setPage(await r.json()); })
      .catch(() => setError("Couldn't load these quests. Reload to try again."));
  }, [id]);

  if (error) return <p className="error-note" role="alert">{error}</p>;
  if (!page) return <div className="concierge-status" role="status"><span className="dot-pulse" aria-hidden="true" /> Opening the quests…</div>;

  const active = FILTERS.find((f) => f.id === filter)!;
  const shown = page.quests.filter(active.test);
  const pct = Math.round((page.completed / page.total) * 100);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <section className="passport" aria-label="Category progress">
        <div style={{ flex: "1 1 260px" }}>
          <div style={{ color: "var(--on-navy)" }}>{page.completed} of {page.total} quests collected</div>
          <div role="progressbar" aria-label="Category progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} style={{ height: 10, background: "rgba(255,255,255,.15)", borderRadius: 999, overflow: "hidden", marginTop: 12, maxWidth: 420 }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "var(--sun)" }} />
          </div>
        </div>
        <dl className="fact-list" style={{ flex: "1 1 260px", color: "#fff" }}>
          <div><dt style={{ color: "var(--blue)" }}>XP earned</dt><dd>{page.xpEarned.toLocaleString("en-US")} / {page.xpTotal.toLocaleString("en-US")}</dd></div>
        </dl>
      </section>

      <div className="tag-row" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className={`chip${filter === f.id ? " chip-on" : ""}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label} ({page.quests.filter(f.test).length})
          </button>
        ))}
      </div>

      {shown.length === 0 && <p className="concierge-reply">Nothing here yet.</p>}
      {DIFFICULTIES.map((d) => {
        const qs = shown.filter((q) => q.difficulty === d);
        if (!qs.length) return null;
        return (
          <section key={d} aria-label={d}>
            <h2 className="display" style={{ margin: "0 0 12px", fontSize: 28 }}>{d} <span className="pick-meta" style={{ fontSize: 15 }}>· {qs[0].xp.toLocaleString("en-US")} XP each</span></h2>
            <ul className="quest-grid">{qs.map((q) => <QuestCard key={q.id} q={q} />)}</ul>
          </section>
        );
      })}
    </div>
  );
}
