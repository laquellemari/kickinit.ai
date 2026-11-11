import { GiftsView } from "@/components/GiftsView";
import { Nav } from "@/components/Nav";

export const metadata = { title: "Gifts · kickinit" };

export default function Page() {
  return (
    <div style={{ minHeight: "100vh" }}>
      <section className="hero">
        <Nav active="gifts" />
        <div className="wrap plan-hero">
          <div className="eyebrow">For them</div>
          <h1 className="display">Gifts.</h1>
        </div>
      </section>
      <main className="plan-main">
        <GiftsView />
      </main>
    </div>
  );
}
