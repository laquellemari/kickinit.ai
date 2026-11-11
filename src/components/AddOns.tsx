"use client";

import { useEffect, useState } from "react";
import type { AddOn } from "@/lib/addons/channel3";
import { money } from "@/lib/format";

/** "Pair it with something to unwrap": Channel3 products bought from the merchant. Renders nothing if there are none. */
export function AddOns({ experienceId, recipientName }: { experienceId: string; recipientName: string }) {
  const [items, setItems] = useState<AddOn[]>([]);
  useEffect(() => {
    fetch(`/api/addons?experience=${encodeURIComponent(experienceId)}`)
      .then((r) => (r.ok ? r.json() : { addOns: [] }))
      .then((b: { addOns: AddOn[] }) => setItems(b.addOns))
      .catch(() => setItems([]));
  }, [experienceId]);
  if (!items.length) return null;
  return (
    <section aria-label="Add-ons" className="concierge-card" style={{ gap: 14 }}>
      <h3 className="display" style={{ margin: 0, fontSize: 26 }}>Pair it with something to unwrap</h3>
      <p className="pick-meta" style={{ margin: 0 }}>Hand {recipientName} something on the day. Bought directly from the shop; not part of the pool.</p>
      <div className="pick-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
        {items.map((a) => (
          <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer sponsored" className="pick" style={{ textDecoration: "none", color: "var(--navy)" }} aria-label={a.title}>
            {a.imageUrl
              ? // Merchant images come from arbitrary hosts, so next/image's allow-list doesn't fit.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.imageUrl} alt="" style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 2 }} />
              : <div className="postcard-photo" style={{ height: 140, background: "var(--sky)" }}>[No photo]</div>}
            <strong style={{ fontSize: 15, lineHeight: 1.3 }}>{a.title}</strong>
            <span className="pick-meta">{[a.brand, a.merchant].filter(Boolean).join(" · ")}</span>
            <strong className="display" style={{ fontSize: 20 }}>{money(a.price)}</strong>
          </a>
        ))}
      </div>
    </section>
  );
}
