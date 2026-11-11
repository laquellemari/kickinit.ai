import { notFound } from "next/navigation";
import { GiftSetup } from "@/components/GiftSetup";
import { Nav } from "@/components/Nav";
import { getExperience } from "@/lib/catalog/catalog";

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
        <Nav active="gifts" />
        <div className="wrap plan-hero">
          <div className="eyebrow">For them · {e.neighborhood}, {e.city}</div>
          <h1 className="display">Gift {e.name}.</h1>
        </div>
      </section>
      <main className="plan-main">
        <div className="detail-grid">
          <article className="concierge-card" style={{ gap: 16 }}>
            <div className="postcard-photo" style={{ height: 260, background: e.bg }}>
              [Photo: {e.photo}]
              <span className="stamp stamp-wide">GIFT</span>
            </div>
            <p className="concierge-reply">{e.description}</p>
          </article>
          <GiftSetup experience={e} initialParty={party} />
        </div>
      </main>
    </div>
  );
}
