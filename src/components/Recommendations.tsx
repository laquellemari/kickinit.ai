"use client";

import Link from "next/link";
import { useRef } from "react";
import { VenuePhoto } from "@/components/VenuePhoto";
import type { Recommendation } from "@/lib/places/similar";

/** A row of similar venues that scrolls sideways, with arrow buttons. */
export function Recommendations({ items, title = "You might also like" }: { items: Recommendation[]; title?: string }) {
  const row = useRef<HTMLDivElement>(null);
  if (!items.length) return null;
  const move = (dir: 1 | -1) => row.current?.scrollBy({ left: dir * row.current.clientWidth * 0.9, behavior: "smooth" });
  return (
    <section aria-label={title} className="recs">
      <div className="recs-head">
        <h2 className="display" style={{ margin: 0, fontSize: 36 }}>{title}</h2>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="round-btn recs-btn" aria-label="Scroll left" onClick={() => move(-1)}>‹</button>
          <button type="button" className="round-btn recs-btn" aria-label="Scroll right" onClick={() => move(1)}>›</button>
        </div>
      </div>
      <div ref={row} className="recs-row" data-testid="recs-row">
        {items.map((r) => (
          <Link key={r.key} href={r.href} className="pick recs-card" aria-label={`${r.name}, ${r.meta}, ${r.price}`}>
            <VenuePhoto placeId={r.placeId} alt={r.name} height={150} bg={r.bg}>
              <span className="stamp" style={{ width: 54, height: 60, fontSize: 9 }}>{r.stamp}</span>
            </VenuePhoto>
            <span className="pick-name" style={{ fontSize: 20 }}>{r.name}</span>
            <span className="pick-meta">{r.meta}</span>
            <strong className="display" style={{ fontSize: 20 }}>{r.price}</strong>
          </Link>
        ))}
      </div>
    </section>
  );
}
