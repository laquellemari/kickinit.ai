"use client";

import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { guests, money } from "@/lib/format";
import { isoDay, slotLabel, startsAtIso, TIME_SLOTS } from "@/lib/slots";

export type CheckoutItem = {
  kind: "partner" | "live";
  itemId: string;
  name: string;
  /** Per person (or per group when `perGroup`). For live venues this is the estimate. */
  unitPrice: string;
  perGroup: boolean;
  partyMin: number;
  partyMax: number;
};

const DAY = 86_400_000;

export function CheckoutPanel({ item, initialParty, clientId, now = new Date() }: { item: CheckoutItem; initialParty: number; clientId: string; now?: Date }) {
  const router = useRouter();
  const sizes = useMemo(() => Array.from({ length: item.partyMax - item.partyMin + 1 }, (_, i) => item.partyMin + i), [item.partyMin, item.partyMax]);
  const [party, setParty] = useState(Math.min(Math.max(initialParty, item.partyMin), item.partyMax));
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const cents = Math.round(Number(item.unitPrice) * 100) * (item.perGroup ? 1 : party);
  const startsAt = startsAtIso(day, time);
  const live = item.kind === "live";

  async function createOrder(): Promise<string> {
    setError("");
    const res = await fetch("/api/paypal/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: item.kind, itemId: item.itemId, partySize: party }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Couldn't start the payment.");
      throw new Error(body.error);
    }
    return body.id;
  }

  async function onApprove(data: { orderID: string }): Promise<void> {
    setBusy(true);
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: data.orderID, kind: item.kind, itemId: item.itemId, partySize: party, startsAt }),
    });
    const body = await res.json();
    if (!res.ok) {
      setBusy(false);
      setError(body.error ?? "Your payment went through but the booking didn't save. Nothing was charged; please try again.");
      return;
    }
    router.push(`/booking/${body.id}`);
  }

  return (
    <aside className="book-panel" aria-label="Book">
      <span className="caps" style={{ color: "var(--muted)" }}>{live ? "Request to book" : "Instant book · kickinit partner"}</span>
      <label>
        Date
        <input type="date" value={day} min={isoDay(now)} max={isoDay(new Date(now.getTime() + 89 * DAY))} onChange={(e) => setDay(e.target.value)} />
      </label>
      <label>
        Time
        <select value={time} onChange={(e) => setTime(e.target.value)}>
          <option value="">Choose a time</option>
          {TIME_SLOTS.map((t) => <option key={t} value={t}>{slotLabel(t)}</option>)}
        </select>
      </label>
      <label>
        Guests
        <select value={party} onChange={(e) => setParty(Number(e.target.value))}>
          {sizes.map((n) => <option key={n} value={n}>{guests(n)}</option>)}
        </select>
      </label>
      <div className="book-total">
        <span className="pick-meta">
          {item.perGroup ? "Flat price for the group" : `${live ? "Est. " : ""}${money(item.unitPrice)} × ${guests(party)}`}
        </span>
        <strong data-testid="total">{money((cents / 100).toFixed(2))}</strong>
      </div>

      {!clientId ? (
        <p className="error-note">Payments aren&rsquo;t set up yet.</p>
      ) : !startsAt ? (
        <p className="pick-meta" style={{ margin: 0 }}>Choose a date and time to continue.</p>
      ) : busy ? (
        <div className="concierge-status" role="status"><span className="dot-pulse" aria-hidden="true" /> Securing your booking…</div>
      ) : (
        <PayPalScriptProvider options={{ clientId, intent: "authorize", currency: "USD" }}>
          <PayPalButtons
            style={{ layout: "horizontal", color: "gold", label: "pay", tagline: false, height: 44 }}
            forceReRender={[party, startsAt]}
            createOrder={createOrder}
            onApprove={onApprove}
            onError={() => setError("PayPal ran into a problem. Nothing was charged; please try again.")}
          />
        </PayPalScriptProvider>
      )}
      {error && <p className="error-note" role="alert">{error}</p>}
      <p className="pick-meta" style={{ margin: 0 }}>
        {live
          ? "PayPal holds this estimate. You're only charged once the venue confirms, and if they can't, the hold is released."
          : "PayPal holds the amount and it's charged the moment your booking is confirmed."}
      </p>
    </aside>
  );
}
