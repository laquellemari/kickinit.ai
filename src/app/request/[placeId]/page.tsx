import { notFound } from "next/navigation";
import { CheckoutPanel } from "@/components/CheckoutPanel";
import { Nav } from "@/components/Nav";
import { getLivePlace, PlacesError } from "@/lib/places/client";
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
            <div className="postcard-photo" style={{ height: 260, background: "#E6EDF3" }}>
              [{place.typeLabel}]
              <span className="stamp stamp-live stamp-wide">REQUEST</span>
            </div>
            <p className="concierge-reply">{place.address}</p>
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
      </main>
    </div>
  );
}
