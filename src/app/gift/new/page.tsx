import { notFound } from "next/navigation";
import { GiftSetup } from "@/components/GiftSetup";
import { Nav } from "@/components/Nav";
import { getExperience } from "@/lib/catalog/catalog";
import { VenuePhoto } from "@/components/VenuePhoto";

export const metadata = { title: "Gift an experience · kickinit" };

export default async function NewGiftPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const e = getExperience(one(sp.experience));
  if (!e) notFound();
  const party = Number(one(sp.party)) || 2;
  return (
    <div style={{ minHeight: "100vh" }}>
      <section className="hero">
        <Nav active="explore" />
        <div className="wrap plan-hero">
          <div className="eyebrow">For them · {e.neighborhood}, {e.city}</div>
          <h1 className="display">Gift {e.name}.</h1>
        </div>
      </section>
      <main className="plan-main">
        <div className="detail-grid">
          <article className="concierge-card" style={{ gap: 16 }}>
            <VenuePhoto placeId={e.placeId} alt={e.name} height={260} bg={e.bg}>
              <span className="stamp stamp-wide">GIFT</span>
            </VenuePhoto>
            <p className="concierge-reply">{e.description}</p>
          </article>
          <GiftSetup experience={e} initialParty={party} />
        </div>
      </main>
    </div>
  );
}
