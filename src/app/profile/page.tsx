import { ProfileView } from "@/components/ProfileView";
import { Nav } from "@/components/Nav";

export const metadata = { title: "Your dashboard · kickinit" };

export default function Page() {
  return (
    <div style={{ minHeight: "100vh" }}>
      <section className="hero">
        <Nav active="explore" />
        <div className="wrap plan-hero">
          <div className="eyebrow">You</div>
          <h1 className="display">Your dashboard.</h1>
        </div>
      </section>
      <main className="plan-main">
        <ProfileView />
      </main>
    </div>
  );
}
