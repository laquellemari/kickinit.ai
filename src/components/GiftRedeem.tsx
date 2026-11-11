"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { RedeemView } from "@/lib/gifts/view";
import { guests } from "@/lib/format";
import { startsAtIso } from "@/lib/slots";
import { WhenPicker } from "./WhenPicker";

const NOT_READY: Record<Exclude<RedeemView["status"], "funded">, string> = {
  open: "Your friends are still putting this together. Check back soon!",
  redeemed: "You've already booked this one. Enjoy!",
  expired: "This gift didn't come together in time, so nobody was charged.",
};

export function GiftRedeem({ code, now = new Date() }: { code: string; now?: Date }) {
  const router = useRouter();
  const [g, setG] = useState<RedeemView | null>(null);
  const [error, setError] = useState("");
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/gifts/redeem/${code}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        setG(body);
      })
      .catch((err: Error) => setError(err.message || "Couldn't load this gift."));
  }, [code]);

  if (!g) return error ? <p className="error-note" role="alert">{error}</p> : <div className="concierge-status" role="status"><span className="dot-pulse" aria-hidden="true" /> Opening your gift…</div>;

  const startsAt = startsAtIso(day, time);
  async function redeem() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/gifts/redeem/${code}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ startsAt }) });
    const body = await res.json();
    if (!res.ok) {
      setBusy(false);
      return setError(body.error ?? "Couldn't book it. Please try again.");
    }
    router.push(`/booking/${body.id}`);
  }

  return (
    <div className="detail-grid">
      <article className="concierge-card" aria-label="Your gift" style={{ gap: 14 }}>
        <h2 className="display" style={{ margin: 0, fontSize: 40 }}>{g.organizerName} sent you something.</h2>
        <p className="concierge-reply" style={{ margin: 0 }}>{g.name} · {guests(g.partySize)}</p>
        {g.note && <p className="pick-why" style={{ fontStyle: "italic" }}>&ldquo;{g.note}&rdquo;</p>}
        {g.status !== "funded" && <p className="concierge-reply" role="status">{NOT_READY[g.status]}</p>}
      </article>
      {g.status === "funded" && (
        <aside className="book-panel" aria-label="Book your gift">
          <span className="caps" style={{ color: "var(--muted)" }}>Already paid for · pick your time</span>
          <WhenPicker day={day} time={time} onDay={setDay} onTime={setTime} now={now} />
          <button type="button" className="btn-navy" disabled={!startsAt || busy} onClick={redeem}>{busy ? "Booking…" : "Book it"}</button>
          {error && <p className="error-note" role="alert">{error}</p>}
        </aside>
      )}
    </div>
  );
}
