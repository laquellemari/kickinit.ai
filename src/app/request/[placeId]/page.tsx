import { notFound } from "next/navigation";
import { CheckoutPanel } from "@/components/CheckoutPanel";
import { LiveMenu } from "@/components/LiveMenu";
import { Nav } from "@/components/Nav";
import { Recommendations } from "@/components/Recommendations";
import { VenueEvents } from "@/components/VenueEvents";
import { VenuePhoto } from "@/components/VenuePhoto";
import { isEventVenue, searchEvents, type LiveEvent } from "@/lib/events/ticketmaster";
import { getLivePlace, PlacesError } from "@/lib/places/client";
import { similarTo } from "@/lib/places/similar";
import type { LivePlace } from "@/lib/places/types";

type Props = { params: Promise<{ placeId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export const metadata = { title: "Request to book · kickinit" };

export default async function RequestPage({ params, searchParams }: Props) {
  const { placeId } = await params;
  let place: LivePlace;
  try {
    place = await getLivePlace(placeId);
  } catch (err) {
    if (err instanceof PlacesError && err.status !== 404) throw err;
    notFound();
  }
  const raw = (await searchParams).party;
  const party = Number(Array.isArray(raw) ? raw[0] : raw) || 2;
  const recs = await similarTo(place, Math.min(Math.max(Math.trunc(party), 1), 20));
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "";
  // A stage or arena: show what's on there (when event search is set up), not a booking form for the building.
  const stage = isEventVenue(place.primaryType) && !!process.env.TICKETMASTER_API_KEY;
  let events: LiveEvent[] | null = null;
  if (stage) {
    events = await searchEvents({ venue: place.name, city: place.city || undefined }).catch((err) => {
      console.error("Venue events failed:", err);
      return null;
    });
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <section className="hero">
        <Nav active="explore" />
        <div className="wrap plan-hero">
          <div className="eyebrow">{place.typeLabel} · Request to book</div>
          <h1 className="display">{place.name}</h1>
        </div>
      </section>
      <main className="plan-main">
        <div className="detail-grid">
          <article className="concierge-card" style={{ gap: 18 }}>
            <VenuePhoto placeId={place.placeId} alt={place.name} height={300}>
              <span className="stamp stamp-live stamp-wide">REQUEST</span>
            </VenuePhoto>
            <p className="concierge-reply">{place.address}</p>
            <section aria-label="About this place" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <p className="google-about">{place.summary ?? `${place.typeLabel} in ${place.city || "the area"}.`}</p>
              {place.rating !== null && (
                <p className="google-meta">★ {place.rating.toFixed(1)} on Google · {place.ratingCount.toLocaleString("en-US")} {place.ratingCount === 1 ? "review" : "reviews"}</p>
              )}
            </section>
            <p className="pick-why">
              {stage
                ? "Here's what's coming up at this venue. Pick a show to get tickets on Ticketmaster."
                : place.dining
                ? "Restaurants and bars are free to book on kickinit. We ask the venue for your table and tell you when it's confirmed; you pay the bill at the end, as usual."
                : "This venue isn't a kickinit partner, so we book it for you at the exact price it publishes. PayPal holds the total and only charges once we've confirmed with the venue; if they can't take you, the hold is released."}
            </p>
            <div className="pick-actions">
              <a className="btn-line" href={place.mapsUrl} target="_blank" rel="noopener noreferrer">View on Google Maps</a>
              {place.website && <a className="btn-line" href={place.website} target="_blank" rel="noopener noreferrer">Their website</a>}
            </div>
          </article>
          {stage ? (
            <VenueEvents name={place.name} events={events} mapsUrl={place.mapsUrl} />
          ) : place.dining ? (
            <CheckoutPanel
              item={{ kind: "live", itemId: place.id, name: place.name, unitPrice: "0.00", perGroup: false, partyMin: 1, partyMax: 20, free: true }}
              initialParty={party}
              clientId={clientId}
            />
          ) : (
            <LiveMenu placeId={place.placeId} itemId={place.id} name={place.name} initialParty={party} clientId={clientId} mapsUrl={place.mapsUrl} />
          )}
        </div>
        <Recommendations items={recs} />
      </main>
    </div>
  );
}
