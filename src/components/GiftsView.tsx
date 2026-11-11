"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { money } from "@/lib/format";

type Organized = { id: string; name: string; recipientName: string; status: string; amount: string; raised: string; mode: string };
type Chipped = { giftId: string; giftName: string; recipientName: string; amount: string; status: string; giftStatus: string };
const LABEL: Record<string, string> = { open: "Collecting", funded: "Funded", redeemed: "Redeemed", expired: "Closed, released" };

export function GiftsView() {
  const [data, setData] = useState<{ organized: Organized[]; chippedIn: Chipped[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/gifts/mine")
      .then(async (r) => { if (!r.ok) throw new Error(); setData(await r.json()); })
      .catch(() => setError("Couldn't load your gifts. Reload to try again."));
  }, []);
  if (error) return <p className="error-note" role="alert">{error}</p>;
  if (!data) return <div className="concierge-status" role="status"><span className="dot-pulse" aria-hidden="true" /> Loading your gifts…</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <section className="concierge-card" aria-label="Start a gift">
        <p className="concierge-reply" style={{ margin: 0 }}>Describe who it&rsquo;s for and the concierge finds something they&rsquo;ll love. Pay it yourself or pool it with friends.</p>
        <Link className="btn-navy" href="/?for=them" style={{ alignSelf: "flex-start" }}>Find a gift</Link>
      </section>
      <section className="concierge-card" aria-label="Gifts you started">
        <h2 className="display" style={{ margin: 0, fontSize: 30 }}>Gifts you started</h2>
        {data.organized.length === 0 ? <p className="pick-meta">None yet.</p> : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {data.organized.map((g) => (
              <li key={g.id} className="pick-price">
                <Link href={`/gift/${g.id}`}>{g.name} for {g.recipientName}</Link>
                <span className="pick-meta">{LABEL[g.status]} · {money(g.raised)} of {money(g.amount)}{g.mode === "pool" ? " · pool" : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="concierge-card" aria-label="Gifts you chipped in to">
        <h2 className="display" style={{ margin: 0, fontSize: 30 }}>Gifts you chipped in to</h2>
        {data.chippedIn.length === 0 ? <p className="pick-meta">None yet.</p> : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {data.chippedIn.map((c, i) => (
              <li key={i} className="pick-price">
                <Link href={`/gift/${c.giftId}`}>{c.giftName} for {c.recipientName}</Link>
                <span className="pick-meta">{money(c.amount)} · {c.status === "held" ? "on hold" : c.status === "captured" ? "charged" : "released"} · {LABEL[c.giftStatus]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
