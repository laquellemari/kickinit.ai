import Link from "next/link";
import type { Pick } from "@/lib/concierge/agent";
import { guests, money } from "@/lib/format";

export function PickCard({ pick, partySize }: { pick: Pick; partySize: number }) {
  if (pick.kind === "partner") {
    const e = pick.experience;
    return (
      <article className="pick" aria-label={e.name}>
        <div className="postcard-photo" style={{ height: 170, background: e.bg, fontSize: 10 }}>
          [Photo: {e.photo}]
          <span className="stamp" style={{ width: 54, height: 60, fontSize: 9 }}>INSTANT BOOK</span>
        </div>
        <h3 className="pick-name">{e.name}</h3>
        <span className="pick-meta">{e.neighborhood}, {e.city}</span>
        <p className="pick-why">{pick.why}</p>
        <div className="pick-price">
          <span className="pick-meta">{guests(partySize)}</span>
          <strong>{money(pick.quote.total)}</strong>
        </div>
        <div className="pick-actions">
          <Link className="btn-navy" href={`/experience/${e.id}?party=${partySize}`}>See details</Link>
        </div>
      </article>
    );
  }
  const p = pick.place;
  return (
    <article className="pick" aria-label={p.name}>
      <div className="postcard-photo" style={{ height: 170, background: "#E6EDF3", fontSize: 10 }}>
        [{p.typeLabel}]
        <span className="stamp stamp-live" style={{ width: 54, height: 60, fontSize: 9 }}>REQUEST</span>
      </div>
      <h3 className="pick-name">{p.name}</h3>
      <span className="pick-meta">{p.address}</span>
      <p className="pick-why">{pick.why}</p>
      <div className="pick-price">
        <span className="pick-meta">Est. hold · {guests(partySize)}</span>
        <strong>{money(pick.quote.total)}</strong>
      </div>
      <div className="pick-actions">
        <a className="btn-line" href={p.mapsUrl} target="_blank" rel="noopener noreferrer">View on Google Maps</a>
      </div>
    </article>
  );
}
