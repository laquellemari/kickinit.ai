import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Carousel, type Slide } from "@/components/Carousel";
import { SearchCard } from "@/components/SearchCard";
import { HomePassport } from "@/components/HomePassport";
import { VenuePhoto } from "@/components/VenuePhoto";
import { getExperience } from "@/lib/catalog/catalog";

const REGION = "Los Angeles · 10 mi";

/** Hero carousel: one real partner venue per mood. */
const SLIDES: { id: string; title: string; stamp: string }[] = [
  { id: "71above", title: "Dinner above the city", stamp: "DINING" },
  { id: "hugh-spa", title: "Soak and sauna", stamp: "SPA" },
  { id: "la-yacht-charter", title: "Sunset on the water", stamp: "OUT-DOORS" },
  { id: "vibrato-grill-jazz", title: "Jazz till late", stamp: "NIGHT" },
  { id: "ojai-valley-inn", title: "Ojai, slowly", stamp: "GET-AWAY" },
  { id: "pottery-studio-1", title: "Clay on the wheel", stamp: "CLASS" },
];
const slides: Slide[] = SLIDES.map(({ id, title, stamp }) => {
  const e = getExperience(id)!;
  return { title, stamp, where: e.neighborhood, placeId: e.placeId, bg: e.bg, href: `/experience/${id}` };
});

/** Postcards: four partners from different categories. */
const CURATED = [
  { id: "carasau-pasta-bar", cat: "DINING", rot: "-1.5deg" },
  { id: "desuar-hollywood-spa", cat: "SPA", rot: "1deg" },
  { id: "kapowui-surf", cat: "OUT-DOORS", rot: "-1deg" },
  { id: "the-normandie-club", cat: "NIGHT", rot: "1.5deg" },
].map((c) => ({ ...c, e: getExperience(c.id)! }));

export default async function Home({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const forThem = (await searchParams)?.for === "them";
  return (
    <div style={{ minHeight: "100vh" }}>
      <section className="hero">
        <Nav active="explore" region={REGION} />
        <div className="wrap hero-body">
          <div className="hero-copy">
            <div className="eyebrow">Los Angeles · this week</div>
            <h1 className="display headline">Plans,<br />without the<br />planning.</h1>
            <p className="subcopy">Tell us the mood. We&rsquo;ll find the table, the treatment or the trip, and hold it while you decide.</p>
          </div>
          <Carousel slides={slides} />
        </div>
      </section>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px 64px", display: "flex", flexDirection: "column", gap: 56 }}>
        <SearchCard initialMode={forThem ? "them" : "you"} />

        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 22, flexWrap: "wrap", gap: 8 }}>
            <h2 className="display" style={{ margin: 0, fontSize: 46 }}>Postcards from this weekend</h2>
            <Link href="/plan" className="caps" style={{ fontWeight: 600 }}>See everything</Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 26 }}>
            {CURATED.map(({ id, cat, rot, e }) => (
              <Link key={id} href={`/experience/${id}`} className="postcard"
                style={{ padding: "10px 10px 16px", transform: `rotate(${rot})`, boxShadow: "0 10px 24px rgba(20,35,75,.12)" }}>
                <VenuePhoto placeId={e.placeId} alt={e.name} height={180} bg={e.bg}>
                  <span className="stamp" style={{ top: 8, right: 8, width: 46, height: 54, fontSize: 9 }}>{cat}</span>
                </VenuePhoto>
                <span className="display" style={{ fontWeight: 800, fontSize: 22, lineHeight: 1 }}>{e.name}</span>
                <span style={{ fontSize: 14, color: "var(--muted)" }}>{e.neighborhood} · {e.city}</span>
              </Link>
            ))}
          </div>
        </section>

        <HomePassport />
      </main>
    </div>
  );
}
