import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { VenuePhoto } from "@/components/VenuePhoto";
import { eventPrice, eventWhen, EventsError, getEvent, type EventDetail } from "@/lib/events/ticketmaster";
import { guests } from "@/lib/format";
import { planNight, type NightStop } from "@/lib/night/plan";
import { slotLabel } from "@/lib/slots";

type Props = { params: Promise<{ eventId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export const metadata = { title: "Plan the night · kickinit" };

function Stops({ stops, party, day, time, empty }: { stops: NightStop[]; party: number; day: string; time: string | null; empty: string }) {
  if (!stops.length) return <p className="concierge-reply" style={{ margin: 0 }}>{empty}</p>;
  const when = time ? `&day=${day}&time=${time}` : "";
  return (
    <div className="night-grid">
      {stops.map((s) => (
        <article key={s.placeId} className="pick night-stop" aria-label={s.name}>
          <VenuePhoto placeId={s.placeId} alt={s.name} height={150} />
          <span className="pick-kicker">{s.typeLabel}</span>
          <h3 className="pick-name" style={{ fontSize: 20 }}>{s.name}</h3>
          <span className="pick-meta pick-line">{s.address}</span>
          {s.rating !== null && <span className="pick-meta">★ {s.rating.toFixed(1)} on Google · {s.ratingCount.toLocaleString("en-US")} reviews</span>}
          <div className="pick-actions">
            <Link className="btn-navy" href={`/request/${s.placeId}?party=${party}${when}`}>Book a table · free</Link>
          </div>
        </article>
      ))}
    </div>
  );
}

export default async function NightPage({ params, searchParams }: Props) {
  const { eventId } = await params;
  const raw = (await searchParams).party;
  const party = Math.min(Math.max(Math.trunc(Number(Array.isArray(raw) ? raw[0] : raw) || 2), 1), 20);
  let detail: EventDetail | null;
  try {
    detail = await getEvent(eventId);
  } catch (err) {
    if (err instanceof EventsError && err.status === 400) notFound();
    throw err;
  }
  if (!detail) notFound();
  const { event: e, times, before, after } = await planNight(detail);
  const price = eventPrice(e);

  return (
    <div style={{ minHeight: "100vh" }}>
      <section className="hero">
        <Nav active="explore" />
        <div className="wrap plan-hero">
          <div className="eyebrow">Your night · {eventWhen(e)}</div>
          <h1 className="display">{e.name}</h1>
        </div>
      </section>
      <main className="plan-main">
        <div className="night">
          <p className="concierge-reply" style={{ margin: 0 }}>
            {times.meal} near {e.venue || "the venue"} before the show, then dessert or drinks after, for {guests(party)}. Tables are free to book; tickets are bought on Ticketmaster.
          </p>

          <section className="night-part" aria-label={`${times.meal} before the show`}>
            <div className="night-part-head">
              <h2 className="display">{times.meal} before the show</h2>
              <span className="night-time">{slotLabel(times.dinner)}</span>
            </div>
            <Stops stops={before} party={party} day={e.localDate} time={times.dinner} empty={`We couldn't find a well-rated spot for ${times.meal.toLowerCase()} near ${e.venue || "the venue"} right now.`} />
          </section>

          <section className="night-part" aria-label="The show">
            <div className="night-part-head">
              <h2 className="display">The show</h2>
              <span className="night-time">{times.show ? slotLabel(times.show) : "Time TBA"}</span>
            </div>
            <article className="pick night-show" aria-label={e.name}>
              <div className="event-photo" style={{ height: 170, backgroundImage: e.image ? `url(${e.image})` : undefined }} role={e.image ? "img" : undefined} aria-label={e.image ? e.name : undefined}>
                <span className="stamp stamp-live" style={{ width: 54, height: 60, fontSize: 9 }}>TICKETS</span>
              </div>
              <div className="night-stop">
                <span className="pick-kicker">{eventWhen(e)}{e.genre ? ` · ${e.genre}` : ""}</span>
                <h3 className="pick-name">{e.name}</h3>
                <span className="pick-meta">{e.venue}{e.city ? `, ${e.city}` : ""}</span>
                <strong>{price ?? "See prices"}</strong>
                <div className="pick-actions">
                  <a className="btn-navy" href={e.url} target="_blank" rel="noopener noreferrer sponsored">Get tickets</a>
                </div>
              </div>
            </article>
          </section>

          <section className="night-part" aria-label="After the show">
            <div className="night-part-head">
              <h2 className="display">Dessert or drinks after</h2>
              <span className="night-time">around {times.afterLabel}</span>
            </div>
            <Stops stops={after} party={party} day={e.localDate} time={times.afterSlot} empty={`We couldn't find a well-rated spot for after the show near ${e.venue || "the venue"} right now.`} />
          </section>
        </div>
      </main>
    </div>
  );
}
