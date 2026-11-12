import Link from "next/link";
import { eventPrice, eventWhen, type LiveEvent } from "@/lib/events/ticketmaster";

/** What's on at a stage or arena, from Ticketmaster. Tickets are bought there. `events` is null when the lookup failed. */
export function VenueEvents({ name, events, mapsUrl }: { name: string; events: LiveEvent[] | null; mapsUrl: string }) {
  return (
    <aside className="book-panel" aria-label="Upcoming events">
      <span className="caps" style={{ color: "var(--muted)" }}>What&rsquo;s on at {name}</span>
      {events === null ? (
        <p className="concierge-reply" style={{ margin: 0 }}>We couldn&rsquo;t load this venue&rsquo;s events right now. Try again in a moment.</p>
      ) : events.length === 0 ? (
        <>
          <p className="concierge-reply" style={{ margin: 0 }}>No upcoming events are listed on Ticketmaster for {name}.</p>
          <a className="btn-line" href={mapsUrl} target="_blank" rel="noopener noreferrer">See the venue on Google Maps</a>
        </>
      ) : (
        <ul className="event-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {events.map((e) => (
            <li key={e.id} className="event-row" aria-label={e.name}>
              <div>
                <strong>{e.name}</strong>
                <div className="pick-meta">{eventWhen(e)}{eventPrice(e) ? ` · ${eventPrice(e)}` : ""}</div>
              </div>
              <div className="event-actions">
                <a className="btn-navy" href={e.url} target="_blank" rel="noopener noreferrer sponsored">Get tickets</a>
                <Link className="btn-line" href={`/night/${e.id.replace(/^tm:/, "")}`}>Plan the night</Link>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="pick-meta" style={{ margin: 0 }}>Tickets are sold by Ticketmaster; you check out on their site.</p>
    </aside>
  );
}
