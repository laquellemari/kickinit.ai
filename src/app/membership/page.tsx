import { MembershipView } from "@/components/MembershipView";
import { Nav } from "@/components/Nav";

export const metadata = { title: "Membership · kickinit" };

export default function Page() {
  return (
    <div style={{ minHeight: "100vh" }}>
      <section className="hero">
        <Nav active="membership" />
        <div className="wrap plan-hero">
          <div className="eyebrow">kickinit membership</div>
          <h1 className="display">Skip the fee.</h1>
        </div>
      </section>
      <main className="plan-main">
        <MembershipView clientId={process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? ""} />
      </main>
    </div>
  );
}
