"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { VenuePhoto } from "./VenuePhoto";

export type ExploreItem = { id: string; name: string; meta: string; placeId: string; bg: string; label: string };
export type QuestTeaser = { id: string; emoji: string; title: string; description: string; xp: number; category: string };

/** What the concierge is doing, shown one after another while the answer comes in. */
export const STEPS = [
  "Reading what you asked for",
  "Searching kickinit experiences",
  "Checking real venues, menus and events nearby",
  "Picking the best fits for you",
] as const;
export const STEP_MS = 2500;
export const SLIDE_MS = 3000;
export const VISIBLE = 4;

/**
 * The wait between asking and the results: live steps, a rotating "More to explore!" row of experiences,
 * and a passport quest to aim for, so the space under the search isn't empty.
 */
export function PlanLoading({ explore = [], teasers = [] }: { explore?: ExploreItem[]; teasers?: QuestTeaser[] }) {
  const [tick, setTick] = useState(0);
  const [start, setStart] = useState(0);

  useEffect(() => {
    const steps = setInterval(() => setTick((t) => t + 1), STEP_MS);
    return () => clearInterval(steps);
  }, []);
  useEffect(() => {
    if (explore.length <= VISIBLE) return;
    const slides = setInterval(() => setStart((s) => (s + 1) % explore.length), SLIDE_MS);
    return () => clearInterval(slides);
  }, [explore.length]);

  const step = Math.min(tick, STEPS.length - 1);
  const seconds = Math.round((tick * STEP_MS) / 1000);
  const row = explore.length <= VISIBLE ? explore : Array.from({ length: VISIBLE }, (_, i) => explore[(start + i) % explore.length]);
  const teaser = teasers.length ? teasers[Math.floor(tick / 3) % teasers.length] : null;

  return (
    <div className="plan-loading">
      <section className="concierge-card loading-steps" aria-label="Finding your options">
        <div className="concierge-status" role="status">
          <span className="dot-pulse" aria-hidden="true" /> {STEPS[step]}…
        </div>
        <ol className="step-list">
          {STEPS.map((s, i) => (
            <li key={s} className={i < step ? "step-done" : i === step ? "step-now" : ""} aria-current={i === step ? "step" : undefined}>
              <span className="step-dot" aria-hidden="true">{i < step ? "✓" : i + 1}</span> {s}
            </li>
          ))}
        </ol>
        <p className="pick-meta" style={{ margin: 0 }}>Usually 8 to 15 seconds{seconds >= 15 ? ". Almost there: big searches take a little longer." : "."}</p>
      </section>

      {row.length > 0 && (
        <section aria-label="More to explore!" className="explore">
          <h2 className="display explore-title">More to explore!</h2>
          <ul className="explore-row" aria-live="polite">
            {row.map((e) => (
              <li key={e.id} className="explore-card">
                <Link href={`/experience/${e.id}`} className="explore-link" aria-label={e.name}>
                  <VenuePhoto placeId={e.placeId} alt={e.name} height={130} bg={e.bg}>
                    <span className="stamp" style={{ width: 54, height: 60, fontSize: 9 }}>{e.label}</span>
                  </VenuePhoto>
                  <span className="explore-name">{e.name}</span>
                  <span className="pick-meta explore-meta">{e.meta}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {teaser && (
        <section aria-label="A quest to aim for" className="concierge-card quest-teaser">
          <span aria-hidden="true" style={{ fontSize: 34 }}>{teaser.emoji}</span>
          <div style={{ flex: 1 }}>
            <span className="caps" style={{ color: "var(--muted)" }}>Passport quest · +{teaser.xp.toLocaleString("en-US")} XP</span>
            <strong style={{ display: "block", fontSize: 18 }}>{teaser.title}</strong>
            <span className="pick-meta">{teaser.description}</span>
          </div>
          <Link className="btn-line" href={`/passport/${teaser.category}`}>See quests</Link>
        </section>
      )}
    </div>
  );
}
