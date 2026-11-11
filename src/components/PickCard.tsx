import Link from "next/link";
import type { PlanPick } from "@/lib/concierge/agent";
import { guests, money } from "@/lib/format";
import { VenuePhoto } from "@/components/VenuePhoto";

export function PickCard({ pick, partySize, gift = false }: { pick: PlanPick; partySize: number; gift?: boolean }) {
  if (pick.kind === "partner") {
    const e = pick.experience;
    return (
      <article className="pick" aria-label={e.name}>
        <VenuePhoto placeId={e.placeId} alt={e.name} height={170} bg={e.bg}>
          <span className="stamp" style={{ width: 54, height: 60, fontSize: 9 }}>INSTANT BOOK</span>
        </VenuePhoto>
        <h3 className="pick-name">{e.name}</h3>
        <span className="pick-meta">{e.neighborhood}, {e.city}</span>
        <p className="pick-why">{pick.why}</p>
        <div className="pick-price">
          <span className="pick-meta">{guests(partySize)}</span>
          <strong>{money(pick.quote.total)}</strong>
        </div>
        <div className="pick-actions">
          {gift ? (
            <Link className="btn-navy" href={`/gift/new?experience=${e.id}&party=${partySize}`}>Gift this</Link>
          ) : (
            <Link className="btn-navy" href={`/experience/${e.id}?party=${partySize}`}>See details</Link>
          )}
        </div>
      </article>
    );
  }
  const p = pick.place;
  return (
    <article className="pick" aria-label={p.name}>
      <VenuePhoto placeId={p.placeId} alt={p.name} height={170}>
        <span className="stamp stamp-live" style={{ width: 54, height: 60, fontSize: 9 }}>REQUEST</span>
      </VenuePhoto>
      <span className="pick-meta">{p.typeLabel}</span>
      <h3 className="pick-name">{p.name}</h3>
      <span className="pick-meta">{p.address}</span>
      <p className="pick-why">{pick.why}</p>
      <div className="pick-price">
        <span className="pick-meta">Est. hold · {guests(partySize)}</span>
        <strong>{money(pick.quote.total)}</strong>
      </div>
      <div className="pick-actions">
        <Link className="btn-navy" href={`/request/${p.placeId}?party=${partySize}`}>Request to book</Link>
        <a className="btn-line" href={p.mapsUrl} target="_blank" rel="noopener noreferrer">Map</a>
      </div>
    </article>
  );
}
