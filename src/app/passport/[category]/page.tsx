import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryQuests } from "@/components/CategoryQuests";
import { Nav } from "@/components/Nav";
import { CATEGORY_INFO, categoryInfo } from "@/lib/passport/passport";

type Props = { params: Promise<{ category: string }> };

export async function generateMetadata({ params }: Props) {
  const c = categoryInfo((await params).category);
  return { title: c ? `${c.name} quests · kickinit` : "Not found · kickinit" };
}

export default async function Page({ params }: Props) {
  const c = categoryInfo((await params).category);
  if (!c) notFound();
  const i = CATEGORY_INFO.findIndex((x) => x.id === c.id);
  const prev = CATEGORY_INFO[(i + CATEGORY_INFO.length - 1) % CATEGORY_INFO.length];
  const next = CATEGORY_INFO[(i + 1) % CATEGORY_INFO.length];
  return (
    <div style={{ minHeight: "100vh" }}>
      <section className="hero">
        <Nav active="passport" />
        <div className="wrap plan-hero">
          <div className="eyebrow">Passport · Quests</div>
          <h1 className="display"><span aria-hidden="true">{c.emoji} </span>{c.name}</h1>
          <Link href="/passport" className="hero-back">← All categories</Link>
        </div>
      </section>
      <main className="plan-main">
        <CategoryQuests id={c.id} />
        <nav aria-label="Other categories" className="pick-actions" style={{ justifyContent: "space-between", marginTop: 32 }}>
          <Link className="btn-line" href={`/passport/${prev.id}`}>← {prev.emoji} {prev.name}</Link>
          <Link className="btn-line" href={`/passport/${next.id}`}>{next.emoji} {next.name} →</Link>
        </nav>
      </main>
    </div>
  );
}
