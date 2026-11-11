import { BookingStatus } from "@/components/BookingStatus";
import { Nav } from "@/components/Nav";

export const metadata = { title: "Your booking · kickinit" };

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div style={{ minHeight: "100vh" }}>
      <section className="hero">
        <Nav active="explore" />
        <div className="wrap plan-hero">
          <div className="eyebrow">Your booking</div>
          <h1 className="display">Postcard sent.</h1>
        </div>
      </section>
      <main className="plan-main">
        <BookingStatus id={id} />
      </main>
    </div>
  );
}
