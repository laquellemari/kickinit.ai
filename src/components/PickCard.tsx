import Link from "next/link";
import type { PlanPick } from "@/lib/concierge/agent";
import { guests, money } from "@/lib/format";
import { eventPrice, eventWhen, isEventVenue } from "@/lib/events/ticketmaster";
import { isDiningExperience } from "@/lib/pricing/fees";
import { VenuePhoto } from "@/components/VenuePhoto";

export function PickCard({ pick, partySize, gift = false }: { pick: PlanPick; partySize: number; gift?: boolean }) {
  if (pick.kind === "partner") {
    const e = pick.experience;
    const free = isDiningExperience(e) && !gift;
    return (
      <article className="pick" aria-label={e.name}>
        <VenuePhoto placeId={e.placeId} alt={e.name} height={170} bg={e.bg}>
          <span className="stamp" style={{ width: 54, height: 60, fontSize: 9 }}>INSTANT BOOK</span>
        </VenuePhoto>
        <h3 className="pick-name">{e.name}</h3>
        <span className="pick-meta">{e.neighborhood}, {e.city}</span>
        <p className="pick-why">{pick.why}</p>
        <div className="pick-price">
          <span className="pick-meta">{free ? "Pay the bill at the end" : `${guests(partySize)} · + concierge fee`}</span>
          <strong>{free ? "Free to book" : money(pick.quote.total)}</strong>
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
  if (pick.kind === "event") {
    const e = pick.event;
    return (
      <article className="pick" aria-label={e.name}>
        <div className="event-photo" style={{ height: 170, backgroundImage: e.image ? `url(${e.image})` : undefined }} role={e.image ? "img" : undefined} aria-label={e.image ? e.name : undefined}>
          <span className="stamp stamp-live" style={{ width: 54, height: 60, fontSize: 9 }}>TICKETS</span>
        </div>
        <span className="pick-meta">{eventWhen(e)}{e.genre ? ` · ${e.genre}` : ""}</span>
        <h3 className="pick-name">{e.name}</h3>
        <span className="pick-meta">{e.venue}{e.city ? `, ${e.city}` : ""}</span>
        <p className="pick-why">{pick.why}</p>
        <div className="pick-price">
          <span className="pick-meta">Tickets on Ticketmaster</span>
          <strong>{eventPrice(e) ?? "See prices"}</strong>
        </div>
        <div className="pick-actions">
          <a className="btn-navy" href={e.url} target="_blank" rel="noopener noreferrer sponsored">Get tickets</a>
        </div>
      </article>
    );
  }
  const p = pick.place;
  const stage = isEventVenue(p.primaryType);
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
        <span className="pick-meta">{stage ? "Upcoming shows here" : p.dining ? "Pay the bill at the end" : "Exact price from the venue"}</span>
        <strong>{stage ? "See what's on" : p.dining ? "Free to book" : "See prices"}</strong>
      </div>
      <div className="pick-actions">
        <Link className="btn-navy" href={`/request/${p.placeId}?party=${partySize}`}>{stage ? "See events" : "Request to book"}</Link>
        <a className="btn-line" href={p.mapsUrl} target="_blank" rel="noopener noreferrer">Map</a>
      </div>
    </article>
  );
}
