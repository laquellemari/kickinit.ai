"use client";

import { useEffect, useState } from "react";
import type { RelevantQuest } from "@/lib/passport/passport";
import { QuestCard } from "./CategoryQuests";

/** Quests shown at a time; "Show more" adds this many again. */
export const QUEST_PAGE = 4;

/** The passport quests a visit here counts toward, four at a time. */
export function VenueQuests({ tags }: { tags: string[] }) {
  const [quests, setQuests] = useState<RelevantQuest[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [shown, setShown] = useState(QUEST_PAGE);
  const key = tags.join(",");

  useEffect(() => {
    let active = true;
    fetch(`/api/passport/quests?tags=${encodeURIComponent(key)}`)
      .then(async (r) => { if (!r.ok) throw new Error(); const body = await r.json(); if (active) setQuests(body.quests); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [key]);

  // Quests are a bonus on this page: if they can't load, or none fit, the section stays out of the way.
  if (failed || (quests && quests.length === 0)) return null;
  return (
    <section aria-label="Quests" className="venue-quests">
      <h2 className="display" style={{ margin: "0 0 4px", fontSize: 34 }}>Quests</h2>
      <p className="pick-meta" style={{ margin: "0 0 16px" }}>Book here, check in, and it counts toward these passport stamps.</p>
      {!quests ? (
        <div className="concierge-status" role="status"><span className="dot-pulse" aria-hidden="true" /> Finding quests…</div>
      ) : (
        <>
          <ul className="quest-grid">{quests.slice(0, shown).map((q) => <QuestCard key={q.id} q={q} find={false} />)}</ul>
          <p className="pick-meta" style={{ margin: "12px 0 0" }}>Showing {Math.min(shown, quests.length)} of {quests.length}</p>
          {shown < quests.length && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
              <button type="button" className="btn-navy" onClick={() => setShown((n) => n + QUEST_PAGE)}>Show more</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
