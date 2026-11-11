"use client";

import { useMemo, useState } from "react";
import type { Experience } from "@/lib/catalog/types";
import { guests, money } from "@/lib/format";

/** Party size picker and live total. The PayPal button arrives with checkout. */
export function BookPanel({ experience: e, initialParty }: { experience: Experience; initialParty: number }) {
  const sizes = useMemo(() => Array.from({ length: e.partyMax - e.partyMin + 1 }, (_, i) => e.partyMin + i), [e.partyMin, e.partyMax]);
  const [party, setParty] = useState(Math.min(Math.max(initialParty, e.partyMin), e.partyMax));
  const cents = Math.round(Number(e.price) * 100) * (e.pricing === "per_group" ? 1 : party);

  return (
    <aside className="book-panel" aria-label="Book">
      <span className="caps" style={{ color: "var(--muted)" }}>Instant book · kickinit partner</span>
      <label>
        Guests
        <select value={party} onChange={(ev) => setParty(Number(ev.target.value))}>
          {sizes.map((n) => <option key={n} value={n}>{guests(n)}</option>)}
        </select>
      </label>
      <div className="book-total">
        <span className="pick-meta">{e.pricing === "per_group" ? "Flat price for the group" : `${money(e.price)} × ${guests(party)}`}</span>
        <strong data-testid="total">{money((cents / 100).toFixed(2))}</strong>
      </div>
      <button type="button" className="btn-navy" disabled>Hold it with PayPal</button>
      <p className="pick-meta" style={{ margin: 0 }}>
        PayPal holds the amount; you&rsquo;re charged only when the venue confirms. Checkout opens in the next update.
      </p>
    </aside>
  );
}
