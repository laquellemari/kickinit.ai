import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Carousel, type Slide } from "@/components/Carousel";
import { SearchCard } from "@/components/SearchCard";

const REGION = "Miami · 10 mi";

const slides: Slide[] = [
  { title: "Dinner on the bay", where: "Coconut Grove", photo: "waterfront dinner at dusk", stamp: "DINING", bg: "#D7E6F2" },
  { title: "Thermal circuit", where: "Wynwood", photo: "bathhouse", stamp: "SPA", bg: "#DCEBEB" },
  { title: "Sunset sail", where: "Biscayne Bay", photo: "sailboat", stamp: "OUT-DOORS", bg: "#CFE3F0" },
  { title: "Jazz till late", where: "Little Havana", photo: "jazz club", stamp: "NIGHT", bg: "#D6DCEC" },
  { title: "The Keys, slowly", where: "2 hrs south", photo: "beach cottage", stamp: "GET-AWAY", bg: "#D2E8F1" },
  { title: "Pasta by hand", where: "Little River", photo: "pasta class", stamp: "CLASS", bg: "#E0E6EC" },
];

const curated = [
  { id: "marea", cat: "DINING", name: "Ristorante Marea", meta: "Coconut Grove · waterfront", photo: "terrace", bg: "#D7E6F2", rot: "-1.5deg" },
  { id: "still-water", cat: "SPA", name: "Still Water", meta: "Wynwood · bathhouse", photo: "bathhouse", bg: "#DCEBEB", rot: "1deg" },
  { id: "biscayne-dusk", cat: "OUT-DOORS", name: "Biscayne at dusk", meta: "Bayside · 2 hrs", photo: "sailboat", bg: "#CFE3F0", rot: "-1deg" },
  { id: "blue-room", cat: "NIGHT", name: "The Blue Room", meta: "Little Havana · jazz", photo: "jazz club", bg: "#D6DCEC", rot: "1.5deg" },
];

const stamps = [
  { t: "Waterfront Table", p: "Collected", rot: "-8deg", done: true },
  { t: "Thermal Circuit", p: "Collected", rot: "6deg", done: true },
  { t: "Pasta Pilgrim", p: "1 of 3", rot: "-3deg", done: false },
  { t: "Circle of Calm", p: "2 of 4", rot: "4deg", done: false },
];

export default function Home() {
  return (
    <div style={{ minHeight: "100vh" }}>
      <section className="hero">
        <Nav active="explore" region={REGION} />
        <div className="wrap hero-body">
          <div className="hero-copy">
            <div className="eyebrow">Miami · this week</div>
            <h1 className="display headline">Plans,<br />without the<br />planning.</h1>
            <p className="subcopy">Tell us the mood. We&rsquo;ll find the table, the treatment or the trip, and hold it while you decide.</p>
          </div>
          <Carousel slides={slides} />
        </div>
      </section>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "0 24px 64px", display: "flex", flexDirection: "column", gap: 56 }}>
        <SearchCard region={REGION} />

        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 22, flexWrap: "wrap", gap: 8 }}>
            <h2 className="display" style={{ margin: 0, fontSize: 46 }}>Postcards from this weekend</h2>
            <Link href="/plan" className="caps" style={{ fontWeight: 600 }}>See everything</Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 26 }}>
            {curated.map((c) => (
              <Link key={c.id} href={`/experience/${c.id}`} className="postcard"
                style={{ padding: "10px 10px 16px", transform: `rotate(${c.rot})`, boxShadow: "0 10px 24px rgba(20,35,75,.12)" }}>
                <span className="postcard-photo" style={{ height: 180, background: c.bg, fontSize: 10 }}>
                  [Photo: {c.photo}]
                  <span className="stamp" style={{ top: 8, right: 8, width: 46, height: 54, fontSize: 9 }}>{c.cat}</span>
                </span>
                <span className="display" style={{ fontWeight: 800, fontSize: 22, lineHeight: 1 }}>{c.name}</span>
                <span style={{ fontSize: 14, color: "var(--muted)" }}>{c.meta}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="passport">
          <div style={{ flex: "1 1 220px" }}>
            <h2 className="display" style={{ margin: 0, fontSize: 40, color: "var(--sun)" }}>Your passport</h2>
            <div style={{ fontSize: 14, color: "var(--on-navy)", marginTop: 4 }}>Adventurer · 1,570 XP</div>
            <Link href="/passport" className="caps" style={{ display: "inline-flex", minHeight: 44, alignItems: "center", color: "#fff" }}>All 403 stamps</Link>
          </div>
          {stamps.map((s) => (
            <Link key={s.t} href="/passport" style={{ textDecoration: "none", display: "flex", justifyContent: "center" }}>
              <span className="passport-stamp" style={{
                borderStyle: s.done ? "solid" : "dashed",
                borderColor: s.done ? "var(--sun)" : "var(--blue)",
                background: s.done ? "var(--sun)" : "transparent",
                color: s.done ? "var(--navy)" : "#fff",
                transform: `rotate(${s.rot})`,
              }}>
                <span className="display" style={{ fontSize: 16, lineHeight: 1 }}>{s.t}</span>
                <span style={{ fontSize: 12, marginTop: 4 }}>{s.p}</span>
              </span>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}
