import { notFound } from "next/navigation";
import { CheckoutPanel } from "@/components/CheckoutPanel";
import { Nav } from "@/components/Nav";
import { Recommendations } from "@/components/Recommendations";
import { VenuePhoto } from "@/components/VenuePhoto";
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
              <p className="google-meta">
                Hold estimate: ${Number(place.estimatePerPerson).toFixed(0)} per person ({place.estimateBasis}). The venue confirms the real amount; you&rsquo;re never charged more than the hold.
              </p>
            </section>
            <p className="pick-why">
              This venue isn&rsquo;t a kickinit partner yet, so we send them your request. PayPal holds an estimate now; you&rsquo;re charged only if they confirm, and the hold is released if they can&rsquo;t.
            </p>
            <div className="pick-actions">
              <a className="btn-line" href={place.mapsUrl} target="_blank" rel="noopener noreferrer">View on Google Maps</a>
            </div>
          </article>
          <CheckoutPanel
            item={{ kind: "live", itemId: place.id, name: place.name, unitPrice: place.estimatePerPerson, perGroup: false, partyMin: 1, partyMax: 20 }}
            initialParty={party}
            clientId={process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? ""}
          />
        </div>
        <Recommendations items={recs} />
      </main>
    </div>
  );
}
