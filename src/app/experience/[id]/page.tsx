import { notFound } from "next/navigation";
import { Nav } from "@/components/Nav";
import { CheckoutPanel } from "@/components/CheckoutPanel";
import { getExperience } from "@/lib/catalog/catalog";
import { duration, guests, money } from "@/lib/format";

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
            <div className="postcard-photo" style={{ height: 320, background: e.bg }}>
              [Photo: {e.photo}]
              <span className="stamp stamp-wide">{e.category.toUpperCase()}</span>
            </div>
            <p className="concierge-reply">{e.description}</p>
            <dl className="fact-list">
              <div><dt>Price</dt><dd>{money(e.price)} {e.pricing === "per_group" ? "per group" : "per person"}</dd></div>
              <div><dt>Length</dt><dd>{duration(e.durationMinutes)}</dd></div>
              <div><dt>Group size</dt><dd>{e.partyMin === e.partyMax ? guests(e.partyMin) : `${e.partyMin}–${e.partyMax} guests`}</dd></div>
              <div><dt>Where</dt><dd>{e.neighborhood}, {e.city}</dd></div>
            </dl>
            <div className="tag-row" aria-label="Tags">
              {e.tags.map((t) => <span key={t} className="tag">{t.replaceAll("_", " ")}</span>)}
            </div>
          </article>
          <CheckoutPanel
            item={{ kind: "partner", itemId: e.id, name: e.name, unitPrice: e.price, perGroup: e.pricing === "per_group", partyMin: e.partyMin, partyMax: e.partyMax }}
            initialParty={party}
            clientId={process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? ""}
          />
        </div>
      </main>
    </div>
  );
}
