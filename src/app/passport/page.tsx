import { PassportView } from "@/components/PassportView";
import { Nav } from "@/components/Nav";

export const metadata = { title: "Your passport · kickinit" };

export default function Page() {
  return (
    <div style={{ minHeight: "100vh" }}>
      <section className="hero">
        <Nav active="passport" />
        <div className="wrap plan-hero">
          <div className="eyebrow">Passport</div>
          <h1 className="display">Stamps collected.</h1>
        </div>
      </section>
      <main className="plan-main">
        <PassportView />
      </main>
    </div>
  );
}
