"use client";

import { useEffect, useState } from "react";
import { duration, money } from "@/lib/format";
import type { MenuItem } from "@/lib/pricing/menu";
import { CheckoutPanel } from "./CheckoutPanel";

type Props = { placeId: string; itemId: string; name: string; initialParty: number; clientId: string; mapsUrl: string };

/** A request-to-book venue's own published prices: the guest picks one, then pays exactly that (plus our fee). */
export function LiveMenu({ placeId, itemId, name, initialParty, clientId, mapsUrl }: Props) {
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<string>("");

  useEffect(() => {
    let active = true;
    fetch(`/api/places/${placeId}/menu`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        if (!active) return;
        setItems(body.items);
        if (body.items.length) setPicked(body.items[0].id);
      })
      .catch((err: Error) => { if (active) setError(err.message || "Couldn't check the venue's prices."); });
    return () => { active = false; };
  }, [placeId]);

  if (error) {
    return (
      <aside className="book-panel" aria-label="Book">
        <p className="error-note" role="alert">{error}</p>
        <p className="pick-meta" style={{ margin: 0 }}>Nothing was charged. Try again in a moment.</p>
      </aside>
    );
  }
  if (!items) {
    return (
      <aside className="book-panel" aria-label="Book">
        <div className="concierge-status" role="status"><span className="dot-pulse" aria-hidden="true" /> Reading {name}&rsquo;s published prices…</div>
        <p className="pick-meta" style={{ margin: 0 }}>We only use prices the venue lists on its own website or booking page, so you pay exactly what they charge.</p>
      </aside>
    );
  }
  if (!items.length) {
    return (
      <aside className="book-panel" aria-label="Book">
        <span className="caps" style={{ color: "var(--muted)" }}>Price not published</span>
        <p className="concierge-reply" style={{ margin: 0 }}>{name} doesn&rsquo;t list its prices online, so we can&rsquo;t book it at an exact price yet.</p>
        <a className="btn-line" href={mapsUrl} target="_blank" rel="noopener noreferrer">Contact them on Google Maps</a>
      </aside>
    );
  }
  const item = items.find((i) => i.id === picked)!;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <fieldset className="book-panel menu-list" aria-label="Their prices">
        <legend className="caps" style={{ color: "var(--muted)" }}>Their published prices</legend>
        {items.map((i) => (
          <label key={i.id} className="menu-item">
            <input type="radio" name="service" value={i.id} checked={picked === i.id} onChange={() => setPicked(i.id)} />
            <span className="menu-name">{i.name}{i.durationMinutes ? ` · ${duration(i.durationMinutes)}` : ""}</span>
            <span className="menu-price">{money(i.price)}{i.per === "group" ? " per group" : " per person"}</span>
          </label>
        ))}
        <a className="pick-meta" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Price as listed by {name}</a>
      </fieldset>
      <CheckoutPanel
        key={item.id}
        item={{ kind: "live", itemId, name, unitPrice: item.price, perGroup: item.per === "group", partyMin: 1, partyMax: 20, free: false, serviceId: item.id }}
        initialParty={initialParty}
        clientId={clientId}
      />
    </div>
  );
}
