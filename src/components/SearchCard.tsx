"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Mode = "you" | "them";

export function SearchCard({ region }: { region: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("you");
  const [what, setWhat] = useState("Dinner");
  const [where, setWhere] = useState(region);
  const [when, setWhen] = useState("Sat · evening");
  const [who, setWho] = useState("2 guests");
  const [ask, setAsk] = useState("");

  function go(q?: string) {
    const params = new URLSearchParams({ mode, where });
    params.set("q", q ?? `${what}, ${when}, ${who}`);
    router.push(`/plan?${params.toString()}`);
  }

  const themFields = mode === "them";

  return (
    <section aria-label="Search" className="search">
      <div role="group" aria-label="Who is this for" className="tabs">
        <button type="button" className="tab" aria-pressed={mode === "you"} onClick={() => setMode("you")}>For you</button>
        <button type="button" className="tab" aria-pressed={mode === "them"} onClick={() => setMode("them")}>For them</button>
      </div>
      <form className="fields" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <label className="field"><span>{themFields ? "Who's it for" : "What"}</span>
          <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder={themFields ? "My sister, loves jazz" : "Dinner"} /></label>
        <label className="field"><span>Where</span>
          <input value={where} onChange={(e) => setWhere(e.target.value)} /></label>
        <label className="field"><span>{themFields ? "Occasion" : "When"}</span>
          <input value={when} onChange={(e) => setWhen(e.target.value)} /></label>
        <label className="field"><span>{themFields ? "Budget" : "Who"}</span>
          <input value={who} onChange={(e) => setWho(e.target.value)} /></label>
        <button type="submit" className="cta">{themFields ? "Find the gift" : "Plan it for me"}</button>
      </form>
      <form className="ask" onSubmit={(e) => { e.preventDefault(); if (ask.trim()) go(ask.trim()); }}>
        <label htmlFor="ask" style={{ fontSize: 14, color: "var(--muted)" }}>Or just say it:</label>
        <input id="ask" value={ask} onChange={(e) => setAsk(e.target.value)}
          placeholder={themFields ? "a spa day for my mom's 60th, under $200" : "a romantic Italian table by the water, Saturday"} />
        <button type="submit" className="text-btn">Make it happen →</button>
      </form>
    </section>
  );
}
