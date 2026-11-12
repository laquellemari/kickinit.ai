"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Experience } from "@/lib/catalog/types";
import { guests, money } from "@/lib/format";
import { MEMBERSHIP_PRICE, withFee } from "@/lib/pricing/fees";
import { isoDay } from "@/lib/slots";
import { useMember } from "./useMember";

const DAY = 86_400_000;

export function GiftSetup({ experience: e, initialParty, member: given, now = new Date() }: { experience: Experience; initialParty: number; member?: boolean; now?: Date }) {
  const router = useRouter();
  const sizes = Array.from({ length: e.partyMax - e.partyMin + 1 }, (_, i) => e.partyMin + i);
  const [party, setParty] = useState(Math.min(Math.max(initialParty, e.partyMin), e.partyMax));
  const [organizerName, setOrganizer] = useState("");
  const [recipientName, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"solo" | "pool">("pool");
  const [deadlineDay, setDeadlineDay] = useState(isoDay(new Date(now.getTime() + 3 * DAY)));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const member = useMember(given);
  // A gift has a known price, so it's the experience plus our concierge fee (none for members).
  const fees = withFee(Math.round(Number(e.price) * 100) * (e.pricing === "per_group" ? 1 : party), member);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/gifts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        experienceId: e.id, partySize: party, organizerName, recipientName, note, mode,
        deadline: mode === "pool" ? new Date(`${deadlineDay}T21:00:00`).toISOString() : undefined,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setBusy(false);
      setError(body.error ?? "Couldn't set up the gift.");
      return;
    }
    router.push(`/gift/${body.id}`);
  }

  return (
    <form className="book-panel" onSubmit={submit} aria-label="Set up the gift">
      <span className="caps" style={{ color: "var(--muted)" }}>Gift it</span>
      <label>Their name<input value={recipientName} onChange={(x) => setRecipient(x.target.value)} maxLength={60} /></label>
      <label>Your name<input value={organizerName} onChange={(x) => setOrganizer(x.target.value)} maxLength={60} /></label>
      <label>A note (optional)<textarea value={note} onChange={(x) => setNote(x.target.value)} maxLength={500} rows={3} style={{ font: "400 16px var(--body)", padding: 10, border: "1px solid var(--line)", borderRadius: 3, letterSpacing: "normal", textTransform: "none", color: "var(--navy)" }} /></label>
      <label>
        Guests
        <select value={party} onChange={(x) => setParty(Number(x.target.value))}>
          {sizes.map((n) => <option key={n} value={n}>{guests(n)}</option>)}
        </select>
      </label>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <legend className="caps" style={{ color: "var(--muted)", fontSize: 11, marginBottom: 6 }}>How you&rsquo;ll pay</legend>
        <label style={{ flexDirection: "row", alignItems: "center", gap: 10, textTransform: "none", letterSpacing: "normal", fontSize: 16, color: "var(--navy)" }}>
          <input type="radio" name="mode" checked={mode === "pool"} onChange={() => setMode("pool")} style={{ minHeight: 0 }} /> Start a group pool, friends chip in
        </label>
        <label style={{ flexDirection: "row", alignItems: "center", gap: 10, textTransform: "none", letterSpacing: "normal", fontSize: 16, color: "var(--navy)" }}>
          <input type="radio" name="mode" checked={mode === "solo"} onChange={() => setMode("solo")} style={{ minHeight: 0 }} /> I&rsquo;ll pay it all
        </label>
      </fieldset>
      {mode === "pool" && (
        <label>
          Pool closes on
          <input type="date" value={deadlineDay} min={isoDay(new Date(now.getTime() + DAY))} max={isoDay(new Date(now.getTime() + 13 * DAY))} onChange={(x) => setDeadlineDay(x.target.value)} />
        </label>
      )}
      <dl className="hold-lines" role="group" aria-label="What the gift costs">
        <div><dt>The experience</dt><dd>{money(fees.venueTotal)}</dd></div>
        <div><dt>Concierge fee ({member ? "members pay none" : "20%"})</dt><dd>{money(fees.fee)}</dd></div>
      </dl>
      <div className="book-total">
        <span className="pick-meta">{mode === "pool" ? "Pool goal" : "Gift total"}</span>
        <strong data-testid="total">{money(fees.total)}</strong>
      </div>
      {!member && <p className="pick-meta" style={{ margin: 0 }}>Members pay no concierge fee (${MEMBERSHIP_PRICE}/month).</p>}
      <button type="submit" className="btn-navy" disabled={busy}>{mode === "pool" ? "Create the pool" : "Continue to payment"}</button>
      {error && <p className="error-note" role="alert">{error}</p>}
      <p className="pick-meta" style={{ margin: 0 }}>
        {mode === "pool"
          ? "Each person's PayPal is only held. Everyone's charged together once the goal is met; if the pool closes short, every hold is released."
          : "You'll pay through PayPal on the next screen, then get a link to send them."}
      </p>
    </form>
  );
}
