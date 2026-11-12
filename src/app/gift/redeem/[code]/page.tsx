import { GiftRedeem } from "@/components/GiftRedeem";
import { Nav } from "@/components/Nav";

export const metadata = { title: "Your gift · kickinit", robots: { index: false } };

export default async function RedeemRoute({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <div style={{ minHeight: "100vh" }}>
      <section className="hero">
        <Nav active="explore" />
        <div className="wrap plan-hero">
          <div className="eyebrow">You&rsquo;ve got a postcard</div>
          <h1 className="display">For you.</h1>
        </div>
      </section>
      <main className="plan-main">
        <GiftRedeem code={code} />
      </main>
    </div>
  );
}
