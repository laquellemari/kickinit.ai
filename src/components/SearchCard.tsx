"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BUDGET, GIFT_FOR, OCCASION, WHAT, WHEN, WHERE, WHO } from "@/lib/search-options";

type Mode = "you" | "them";
type Ideas = { status: "idle" } | { status: "loading" } | { status: "done"; ideas: string[]; personalized: boolean } | { status: "error"; message: string };

function Select({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return (
    <label className="field"><span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

export function SearchCard({ region = WHERE[0], initialMode = "you" }: { region?: string; initialMode?: Mode }) {
  const router = useRouter();
  const places = (WHERE as readonly string[]).includes(region) ? WHERE : [region, ...WHERE];
  const [mode, setMode] = useState<Mode>(initialMode);
  const [where, setWhere] = useState(region);
  const [what, setWhat] = useState<string>("Dinner");
  const [when, setWhen] = useState<string>("Evening");
  const [who, setWho] = useState<string>("2 guests");
  const [giftFor, setGiftFor] = useState<string>(GIFT_FOR[0]);
  const [occasion, setOccasion] = useState<string>(OCCASION[0]);
  const [budget, setBudget] = useState<string>("Under $200");
  const [ask, setAsk] = useState("");
  const [ideas, setIdeas] = useState<Ideas>({ status: "idle" });

  const them = mode === "them";

  function go(q: string) {
    const params = new URLSearchParams({ mode, where });
    params.set("q", q);
    router.push(`/plan?${params.toString()}`);
  }

  async function getIdeas() {
    setIdeas({ status: "loading" });
    try {
      const res = await fetch("/api/ideas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, where }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't come up with ideas right now.");
      setIdeas({ status: "done", ideas: body.ideas, personalized: body.personalized });
    } catch (err) {
      setIdeas({ status: "error", message: (err as Error).message });
    }
  }

  return (
    <section aria-label="Search" className="search">
      <div role="group" aria-label="Who is this for" className="tabs">
        <button type="button" className="tab" aria-pressed={!them} onClick={() => setMode("you")}>For you</button>
        <button type="button" className="tab" aria-pressed={them} onClick={() => setMode("them")}>For them</button>
      </div>
      <form className="fields" onSubmit={(e) => { e.preventDefault(); go(them ? `Gift for ${giftFor.toLowerCase()}, ${occasion}, ${budget}` : `${what}, ${when.toLowerCase()}, ${who}`); }}>
        {them
          ? <Select label="Who's it for" value={giftFor} options={GIFT_FOR} onChange={setGiftFor} />
          : <Select label="What" value={what} options={WHAT} onChange={setWhat} />}
        <Select label="Where" value={where} options={places} onChange={setWhere} />
        {them
          ? <Select label="Occasion" value={occasion} options={OCCASION} onChange={setOccasion} />
          : <Select label="When" value={when} options={WHEN} onChange={setWhen} />}
        {them
          ? <Select label="Budget" value={budget} options={BUDGET} onChange={setBudget} />
          : <Select label="Who" value={who} options={WHO} onChange={setWho} />}
        <button type="submit" className="cta">{them ? "Find the gift" : "Plan it for me"}</button>
      </form>
      <form className="chat" onSubmit={(e) => { e.preventDefault(); if (ask.trim()) go(ask.trim()); }}>
        <label htmlFor="ask" className="chat-label">Or just say it:</label>
        <div className="chat-row">
          <textarea id="ask" rows={3} value={ask} onChange={(e) => setAsk(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
            placeholder={them ? "a spa day for my mom's 60th, under $200" : "a romantic Italian table by the water, Saturday"} />
          <div className="chat-actions">
            <button type="submit" className="btn-navy chat-go">Make it happen →</button>
            <button type="button" className="btn-line chat-idea" onClick={getIdeas} disabled={ideas.status === "loading"}>Give me an idea</button>
          </div>
        </div>
        {ideas.status === "loading" && <p className="chat-note" role="status">Thinking of ideas…</p>}
        {ideas.status === "error" && <p className="error-note" role="alert">{ideas.message}</p>}
        {ideas.status === "done" && (
          <div className="ideas" role="group" aria-label="Ideas">
            <span className="chat-note">{ideas.personalized ? "Based on your searches:" : "A few to start with:"}</span>
            {ideas.ideas.map((idea) => (
              <button key={idea} type="button" className="idea" onClick={() => { setAsk(idea); document.getElementById("ask")?.focus(); }}>{idea}</button>
            ))}
          </div>
        )}
      </form>
    </section>
  );
}
