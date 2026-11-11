import { headers } from "next/headers";
import { GiftPage } from "@/components/GiftPage";
import { Nav } from "@/components/Nav";

export const metadata = { title: "A gift · kickinit" };

export default async function GiftRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "kickinit.onrender.com"}`;
  return (
    <div style={{ minHeight: "100vh" }}>
      <section className="hero">
        <Nav active="gifts" />
        <div className="wrap plan-hero">
          <div className="eyebrow">Group gift</div>
          <h1 className="display">Chip in.</h1>
        </div>
      </section>
      <main className="plan-main">
        <GiftPage id={id} clientId={process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? ""} origin={origin} />
      </main>
    </div>
  );
}
