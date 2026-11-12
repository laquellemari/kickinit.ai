"use client";

import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { guests, money } from "@/lib/format";
import { CONCIERGE_FEE_RATE, MEMBERSHIP_PRICE, withFee } from "@/lib/pricing/fees";
import { startsAtIso } from "@/lib/slots";
import { useMember } from "./useMember";
import { WhenPicker } from "./WhenPicker";

export type CheckoutItem = {
  kind: "partner" | "live";
  itemId: string;
  name: string;
  /** The venue's exact price, per person (or per group when `perGroup`). Ignored when `free`. */
  unitPrice: string;
  perGroup: boolean;
  partyMin: number;
  partyMax: number;
  /** Restaurants and bars: free to book, no PayPal; the guest pays the bill at the end. */
  free: boolean;
  /** Which of the venue's published prices (venues priced from their own menu). */
  serviceId?: string;
};

/** `member` is looked up from /api/membership unless given. It only changes what's shown: the server sets the price. */
/** `initialDay` and `initialTime` pre-fill the time, e.g. dinner before a show the guest planned the night around. */
export function CheckoutPanel({ item, initialParty, clientId, member: given, now = new Date(), initialDay = "", initialTime = "" }: { item: CheckoutItem; initialParty: number; clientId: string; member?: boolean; now?: Date; initialDay?: string; initialTime?: string }) {
  const router = useRouter();
  const sizes = useMemo(() => Array.from({ length: item.partyMax - item.partyMin + 1 }, (_, i) => item.partyMin + i), [item.partyMin, item.partyMax]);
  const [party, setParty] = useState(Math.min(Math.max(initialParty, item.partyMin), item.partyMax));
  const [day, setDay] = useState(initialDay);
  const [time, setTime] = useState(initialTime);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const member = useMember(given, item.free);

  const live = item.kind === "live";
  const venueCents = Math.round(Number(item.unitPrice) * 100) * (item.perGroup ? 1 : party);
  const fees = withFee(venueCents, member);
  const startsAt = startsAtIso(day, time);
  const booking = { kind: item.kind, itemId: item.itemId, partySize: party, ...(item.serviceId && { serviceId: item.serviceId }) };

  async function saveBooking(extra: Record<string, unknown>, fallback: string): Promise<void> {
    setBusy(true);
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...booking, startsAt, ...extra }),
    });
    const body = await res.json();
    if (!res.ok) {
      setBusy(false);
      setError(body.error ?? fallback);
      return;
    }
    router.push(`/booking/${body.id}`);
  }

  async function createOrder(): Promise<string> {
    setError("");
    const res = await fetch("/api/paypal/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(booking) });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Couldn't start the payment.");
      throw new Error(body.error);
    }
    return body.id;
  }

  const heading = item.free ? "Book a table · free" : "Book";

  return (
    <aside className="book-panel" aria-label="Book">
      <span className="caps" style={{ color: "var(--muted)" }}>{heading}</span>
      <WhenPicker day={day} time={time} onDay={setDay} onTime={setTime} now={now} maxDays={live ? 27 : 89} />
      <label>
        Guests
        <select value={party} onChange={(e) => setParty(Number(e.target.value))}>
          {sizes.map((n) => <option key={n} value={n}>{guests(n)}</option>)}
        </select>
      </label>

      {item.free ? (
        <div className="book-total">
          <span className="pick-meta">Cost to book</span>
          <strong data-testid="total">Free</strong>
        </div>
      ) : (
        <>
          <dl className="hold-lines" role="group" aria-label="What you pay">
            <div><dt>Venue price ({item.perGroup ? "per group" : `${money(item.unitPrice)} × ${guests(party)}`})</dt><dd>{money(fees.venueTotal)}</dd></div>
            <div><dt>Concierge fee ({member ? "members pay none" : `${Math.round(CONCIERGE_FEE_RATE * 100)}%`})</dt><dd>{money(fees.fee)}</dd></div>
          </dl>
          <div className="book-total">
            <span className="pick-meta">Total</span>
            <strong data-testid="total">{money(fees.total)}</strong>
          </div>
          {!member && (
            <p className="pick-meta" style={{ margin: 0 }}>
              Members pay no concierge fee. <Link href="/membership">Join for ${MEMBERSHIP_PRICE}/month</Link> and save {money(fees.fee)} on this booking.
            </p>
          )}
        </>
      )}

      {!startsAt ? (
        <p className="pick-meta" style={{ margin: 0 }}>Choose a date and time to continue.</p>
      ) : busy ? (
        <div className="concierge-status" role="status"><span className="dot-pulse" aria-hidden="true" /> Securing your booking…</div>
      ) : item.free ? (
        <button type="button" className="btn-navy" onClick={() => { setError(""); void saveBooking({ free: true }, "Couldn't save the booking. Please try again."); }}>
          Book this table
        </button>
      ) : !clientId ? (
        <p className="error-note">Payments aren&rsquo;t set up yet.</p>
      ) : (
        <PayPalScriptProvider options={{ clientId, intent: "authorize", currency: "USD" }}>
          <PayPalButtons
            style={{ layout: "horizontal", color: "gold", label: "pay", tagline: false, height: 44 }}
            forceReRender={[party, startsAt, item.serviceId]}
            createOrder={createOrder}
            onApprove={(data: { orderID: string }) => saveBooking({ orderId: data.orderID }, "Your payment went through but the booking didn't save. Nothing was charged; please try again.")}
            onError={() => setError("PayPal ran into a problem. Nothing was charged; please try again.")}
          />
        </PayPalScriptProvider>
      )}
      {error && <p className="error-note" role="alert">{error}</p>}
      <p className="pick-meta" style={{ margin: 0 }}>
        {item.free
          ? "We confirm your table with the venue and show it on your booking page. Nothing to pay us: you pay the venue's bill at the end."
          : "PayPal holds the total and charges it once your booking is confirmed. If the venue can't take you, the hold is released and nothing is charged."}
      </p>
    </aside>
  );
}
