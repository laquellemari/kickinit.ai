import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { CheckoutPanel } from "@/components/CheckoutPanel";
import { getExperience } from "@/lib/catalog/catalog";
import { duration, guests, money } from "@/lib/format";
import { VenuePhoto } from "@/components/VenuePhoto";
import { VenueQuests } from "@/components/VenueQuests";
import { averageFor } from "@/lib/ratings/ratings";
import { isDiningExperience } from "@/lib/pricing/fees";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Pick<Props, "params">) {
  const e = getExperience((await params).id);
  return { title: e ? `${e.name} · kickinit` : "Not found · kickinit" };
}

export default async function ExperiencePage({ params, searchParams }: Props) {
  const e = getExperience((await params).id);
  if (!e) notFound();
  const raw = (await searchParams).party;
  const party = Number(Array.isArray(raw) ? raw[0] : raw) || 2;
  // Guest ratings are a bonus: the page still renders if the database is unavailable.
  const score = await averageFor(e.id).catch(() => null);
  const free = isDiningExperience(e);

  return (
    <div style={{ minHeight: "100vh" }}>
      <section className="hero">
        <Nav active="explore" region={`${e.city}`} />
        <div className="wrap plan-hero">
          <div className="eyebrow">{e.category} · {e.neighborhood}, {e.city}</div>
          <h1 className="display">{e.name}</h1>
        </div>
      </section>
      <main className="plan-main">
        <div className="detail-grid">
          <article className="concierge-card" style={{ gap: 20 }}>
            <VenuePhoto placeId={e.placeId} alt={e.name} height={320} bg={e.bg}>
              <span className="stamp stamp-wide">{e.category.toUpperCase()}</span>
            </VenuePhoto>
            <p className="concierge-reply">{e.description}</p>
            {score && <p className="google-meta">★ {score.average.toFixed(1)} from {score.count} kickinit {score.count === 1 ? "guest" : "guests"}</p>}
            <p className="pick-meta" style={{ margin: 0 }}>Demo partner: a real venue, shown with its Google photo. kickinit has no partnership with it; prices are illustrative and bookings run in the PayPal sandbox.</p>
            <dl className="fact-list">
              <div><dt>Price</dt><dd>{free ? "Free to book · pay the bill at the end" : `${money(e.price)} ${e.pricing === "per_group" ? "per group" : "per person"}`}</dd></div>
              <div><dt>Length</dt><dd>{duration(e.durationMinutes)}</dd></div>
              <div><dt>Group size</dt><dd>{e.partyMin === e.partyMax ? guests(e.partyMin) : `${e.partyMin}–${e.partyMax} guests`}</dd></div>
              <div><dt>Where</dt><dd>{e.neighborhood}, {e.city}</dd></div>
            </dl>
            <div className="tag-row" aria-label="Tags">
              {e.tags.map((t) => <span key={t} className="tag">{t.replaceAll("_", " ")}</span>)}
            </div>
          </article>
          <CheckoutPanel
            item={{ kind: "partner", itemId: e.id, name: e.name, unitPrice: e.price, perGroup: e.pricing === "per_group", partyMin: e.partyMin, partyMax: e.partyMax, free }}
            initialParty={party}
            clientId={process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? ""}
          />
        </div>
        <VenueQuests tags={e.tags} />
      </main>
    </div>
  );
}
