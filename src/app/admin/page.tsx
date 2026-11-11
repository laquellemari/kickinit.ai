import { AdminBookings } from "@/components/AdminBookings";
import { Nav } from "@/components/Nav";

export const metadata = { title: "Venue requests · kickinit", robots: { index: false } };

export default function AdminPage() {
  return (
    <div style={{ minHeight: "100vh" }}>
      <section className="hero">
        <Nav active="explore" />
        <div className="wrap plan-hero">
          <div className="eyebrow">Venue desk</div>
          <h1 className="display">Requests.</h1>
        </div>
      </section>
      <main className="plan-main">
        <AdminBookings />
      </main>
    </div>
  );
}
