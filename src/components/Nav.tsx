import Link from "next/link";

const LINKS = [
  { href: "/", label: "Explore", key: "explore" },
  { href: "/passport", label: "Passport", key: "passport" },
  { href: "/gifts", label: "Gifts", key: "gifts" },
  { href: "/membership", label: "Membership", key: "membership" },
] as const;

export function Nav({ active, region = "Los Angeles · 10 mi" }: { active: (typeof LINKS)[number]["key"]; region?: string }) {
  return (
    <>
      <div className="awning" aria-hidden="true" />
      <header className="wrap nav">
        <Link href="/" className="brand">kickinit</Link>
        <nav aria-label="Main" className="nav-links">
          {LINKS.map((l) => (
            <Link key={l.key} href={l.href} className="nav-link caps" aria-current={l.key === active ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div style={{ flex: 1 }} />
        <button className="region-pill" type="button">{region}</button>
        <Link href="/profile" aria-label="Your profile" className="avatar">K</Link>
      </header>
    </>
  );
}
