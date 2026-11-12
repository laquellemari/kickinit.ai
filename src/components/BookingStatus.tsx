"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PublicBooking } from "@/lib/bookings/public";
import { guests, money } from "@/lib/format";

type Copy = { title: string; body: (b: PublicBooking) => string; stamp: string };
const feeNote = (b: PublicBooking) => (b.fee && Number(b.fee) > 0 ? ` (the venue's price plus our ${money(b.fee)} concierge fee)` : "");

/** Paid bookings: the exact price is held, then charged when confirmed. */
const PAID: Record<PublicBooking["status"], Copy> = {
  confirmed: { title: "You're booked.", stamp: "CONFIRMED", body: (b) => `${money(b.amount)} charged to PayPal${feeNote(b)}. Show this page when you arrive.` },
  held: { title: "Request sent.", stamp: "ON HOLD", body: (b) => `PayPal is holding ${money(b.amount)}${feeNote(b)}. It's charged only once we confirm with the venue; if they can't take you, the hold is released.` },
  declined: { title: "Not available.", stamp: "RELEASED", body: () => "The venue couldn't take this booking, so we released the hold. You weren't charged." },
  failed: { title: "Something went wrong.", stamp: "FAILED", body: () => "This booking didn't go through and you weren't charged." },
};

/** Restaurants and bars: nothing to pay kickinit; the guest pays the venue's bill at the end. */
const FREE: Record<PublicBooking["status"], Copy> = {
  confirmed: { title: "You're booked.", stamp: "CONFIRMED", body: () => "Your table is confirmed. There's nothing to pay kickinit: you pay the venue's bill at the end. Show this page when you arrive." },
  held: { title: "Request sent.", stamp: "REQUESTED", body: (b) => `We're asking ${b.name} for your table and will confirm it here. Booking is free: you pay the venue's bill at the end.` },
  declined: { title: "Not available.", stamp: "DECLINED", body: () => "The venue couldn't take this booking. Nothing was charged." },
  failed: { title: "Something went wrong.", stamp: "FAILED", body: () => "This booking didn't go through. Nothing was charged." },
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

  async function answer(accept: boolean) {
    setCheckInError("");
    const res = await fetch(`/api/bookings/${id}/proposal`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accept }) });
    const body = await res.json();
    if (!res.ok) return setCheckInError(body.error ?? "Couldn't save your answer.");
    setB(body);
  }

  async function checkIn() {
    setCheckInError("");
    const res = await fetch(`/api/bookings/${id}/check-in`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) return setCheckInError(body.error ?? "Couldn't check you in.");
    setB(body);
  }

  const base = (b.free ? FREE : PAID)[b.status];
  const offered = b.status === "held" && !!b.proposedStartsAt;
  const c = offered
    ? { title: "A new time is offered.", stamp: "NEW TIME", body: "The venue answered your request with a different time. Nothing has been charged yet." }
    : { ...base, body: base.body(b) };
  const fmt = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
  const when = fmt(b.startsAt);
  return (
    <article className="concierge-card" aria-label="Booking" style={{ gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <div>
          <h2 className="display" style={{ margin: 0, fontSize: 40 }}>{c.title}</h2>
          <p className="concierge-reply" style={{ marginTop: 8 }}>{c.body}</p>
        </div>
        <span className={`stamp stamp-wide ${b.status === "confirmed" ? "" : "stamp-live"}`} style={{ position: "static", height: 64 }}>{c.stamp}</span>
      </div>
      {b.status === "held" && b.proposedStartsAt && (
        <section className="offer" aria-label="A new time from the venue" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p className="concierge-reply" style={{ margin: 0 }}>
            {b.name} can&rsquo;t do {when}, but they can do <strong>{fmt(b.proposedStartsAt)}</strong>.
            {b.free ? "" : ` Take it and your ${money(b.amount)} is charged now; say no and the hold is released.`}
          </p>
          <div className="pick-actions">
            <button type="button" className="btn-navy" onClick={() => answer(true)}>Take the new time</button>
            <button type="button" className="btn-line" onClick={() => answer(false)}>{b.free ? "No thanks, cancel" : "No thanks, release my hold"}</button>
          </div>
          {checkInError && <p className="error-note" role="alert">{checkInError}</p>}
        </section>
      )}
      <dl className="fact-list">
        <div><dt>Where</dt><dd>{b.name}</dd></div>
        <div><dt>When</dt><dd>{when}</dd></div>
        <div><dt>Party</dt><dd>{guests(b.partySize)}</dd></div>
        {b.serviceName && <div><dt>Booked</dt><dd>{b.serviceName}</dd></div>}
        {b.free
          ? <div><dt>Cost to book</dt><dd>Free</dd></div>
          : <div><dt>{b.status === "confirmed" ? "Paid" : "Amount"}</dt><dd>{money(b.amount)}</dd></div>}
        {b.paypalOrderId && <div><dt>PayPal order</dt><dd style={{ fontSize: 14 }}>{b.paypalOrderId}</dd></div>}
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
