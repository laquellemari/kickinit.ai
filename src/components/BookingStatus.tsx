"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PublicBooking } from "@/lib/bookings/public";
import { guests, money } from "@/lib/format";

const COPY: Record<PublicBooking["status"], { title: string; body: (b: PublicBooking) => string; stamp: string }> = {
  confirmed: { title: "You're booked.", stamp: "CONFIRMED", body: (b) => `${money(b.amount)} charged to PayPal. Show this page when you arrive.` },
  held: { title: "Request sent.", stamp: "ON HOLD", body: (b) => `PayPal is holding ${money(b.amount)}. You'll be charged only if the venue confirms; if they can't, the hold is released.` },
  declined: { title: "Not available.", stamp: "RELEASED", body: () => "The venue couldn't take this booking, so we released the hold. You weren't charged." },
  failed: { title: "Something went wrong.", stamp: "FAILED", body: () => "This booking didn't go through and you weren't charged." },
};

export function BookingStatus({ id }: { id: string }) {
  const [b, setB] = useState<PublicBooking | null>(null);
  const [error, setError] = useState("");

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

  const c = COPY[b.status];
  const when = new Date(b.startsAt).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <article className="concierge-card" aria-label="Booking" style={{ gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <div>
          <h2 className="display" style={{ margin: 0, fontSize: 40 }}>{c.title}</h2>
          <p className="concierge-reply" style={{ marginTop: 8 }}>{c.body(b)}</p>
        </div>
        <span className={`stamp stamp-wide ${b.status === "confirmed" ? "" : "stamp-live"}`} style={{ position: "static", height: 64 }}>{c.stamp}</span>
      </div>
      <dl className="fact-list">
        <div><dt>Where</dt><dd>{b.name}</dd></div>
        <div><dt>When</dt><dd>{when}</dd></div>
        <div><dt>Party</dt><dd>{guests(b.partySize)}</dd></div>
        <div><dt>{b.status === "confirmed" ? "Paid" : "Amount"}</dt><dd>{money(b.amount)}</dd></div>
        <div><dt>PayPal order</dt><dd style={{ fontSize: 14 }}>{b.paypalOrderId}</dd></div>
      </dl>
      <div className="pick-actions">
        <Link className="btn-line" href="/">Plan something else</Link>
      </div>
    </article>
  );
}
