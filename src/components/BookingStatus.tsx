"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { liveCopy } from "@/lib/bookings/bill-copy";
import type { PublicBooking } from "@/lib/bookings/public";
import { guests, money } from "@/lib/format";

const COPY: Record<PublicBooking["status"], { title: string; body: (b: PublicBooking) => string; stamp: string }> = {
  confirmed: { title: "You're booked.", stamp: "CONFIRMED", body: (b) => `${money(b.amount)} charged to PayPal. Show this page when you arrive.` },
  held: { title: "Request sent.", stamp: "ON HOLD", body: (b) => `PayPal is holding ${money(b.amount)}. You'll be charged only if the venue confirms; if they can't, the hold is released.` },
  declined: { title: "Not available.", stamp: "RELEASED", body: () => "The venue couldn't take this booking, so we released the hold. You weren't charged." },
  failed: { title: "Something went wrong.", stamp: "FAILED", body: () => "This booking didn't go through and you weren't charged." },
};

type View = PublicBooking & { rating?: { stars: number; note: string } | null };

/** 1–5 stars and an optional note, for a visit the guest checked in to. */
function RateVisit({ id, onRated }: { id: string; onRated: (r: { stars: number; note: string }) => void }) {
  const [stars, setStars] = useState(0);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  async function send() {
    setError("");
    const res = await fetch(`/api/bookings/${id}/rating`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ stars, note }) });
    const body = await res.json();
    if (!res.ok) return setError(body.error ?? "Couldn't save your rating.");
    onRated({ stars: body.stars, note: body.note });
  }
  return (
    <form className="rate" aria-label="Rate your visit" onSubmit={(e) => { e.preventDefault(); void send(); }}>
      <span className="caps">How was it?</span>
      <div role="group" aria-label="Stars" style={{ display: "flex", gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className="star" aria-label={`${n} star${n === 1 ? "" : "s"}`} aria-pressed={stars === n} onClick={() => setStars(n)}>
            {n <= stars ? "★" : "☆"}
          </button>
        ))}
      </div>
      <label className="pick-meta" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        A note (optional)
        <textarea rows={2} maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button type="submit" className="btn-navy" style={{ alignSelf: "flex-start" }} disabled={stars === 0}>Save rating</button>
      {error && <p className="error-note" role="alert">{error}</p>}
    </form>
  );
}

export function BookingStatus({ id }: { id: string }) {
  const [b, setB] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [checkInError, setCheckInError] = useState("");

  useEffect(() => {
    fetch(`/api/bookings/${id}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        setB(body);
      })
      .catch((err: Error) => setError(err.message || "Couldn't load this booking."));
  }, [id]);

  if (error) return <p className="error-note" role="alert">{error}</p>;
  if (!b) return <div className="concierge-status" role="status"><span className="dot-pulse" aria-hidden="true" /> Loading your booking…</div>;

  async function checkIn() {
    setCheckInError("");
    const res = await fetch(`/api/bookings/${id}/check-in`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) return setCheckInError(body.error ?? "Couldn't check you in.");
    setB(body);
  }

  const base = COPY[b.status];
  const live = liveCopy(b);
  const c = live ?? { ...base, body: base.body(b), amountLabel: b.status === "confirmed" ? "Paid" : "Amount", amount: b.amount, alert: false };
  const when = new Date(b.startsAt).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <article className="concierge-card" aria-label="Booking" style={{ gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <div>
          <h2 className="display" style={{ margin: 0, fontSize: 40 }}>{c.title}</h2>
          <p className="concierge-reply" style={{ marginTop: 8 }} role={c.alert ? "alert" : undefined}>{c.body}</p>
        </div>
        <span className={`stamp stamp-wide ${b.status === "confirmed" && !c.alert ? "" : "stamp-live"}`} style={{ position: "static", height: 64 }}>{c.stamp}</span>
      </div>
      <dl className="fact-list">
        <div><dt>Where</dt><dd>{b.name}</dd></div>
        <div><dt>When</dt><dd>{when}</dd></div>
        <div><dt>Party</dt><dd>{guests(b.partySize)}</dd></div>
        <div><dt>{c.amountLabel}</dt><dd>{money(c.amount)}</dd></div>
        <div><dt>PayPal order</dt><dd style={{ fontSize: 14 }}>{b.paypalOrderId}</dd></div>
      </dl>
      {b.status === "confirmed" && !b.checkedInAt && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <button type="button" className="btn-navy" style={{ alignSelf: "flex-start" }} onClick={checkIn}>I&rsquo;m here: check in</button>
          <span className="pick-meta">Opens 2 hours before your booking. Checking in adds the stamp to your passport.</span>
          {checkInError && <p className="error-note" role="alert">{checkInError}</p>}
        </div>
      )}
      {b.checkedInAt && <p className="concierge-reply" role="status">Checked in. <Link href="/passport">See your passport</Link>.</p>}
      {b.checkedInAt && !b.rating && <RateVisit id={b.id} onRated={(rating) => setB({ ...b, rating })} />}
      {b.rating && (
        <p className="pick-meta" aria-label="Your rating">
          You rated it {"★".repeat(b.rating.stars)}{"☆".repeat(5 - b.rating.stars)}{b.rating.note ? `: “${b.rating.note}”` : ""}
        </p>
      )}
      <div className="pick-actions">
        <Link className="btn-line" href="/">Plan something else</Link>
      </div>
    </article>
  );
}
