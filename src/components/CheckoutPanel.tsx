"use client";

import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { holdFor } from "@/lib/places/quote";
import { guests, money } from "@/lib/format";
import { startsAtIso } from "@/lib/slots";
import { WhenPicker } from "./WhenPicker";

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

export function CheckoutPanel({ item, initialParty, clientId, now = new Date() }: { item: CheckoutItem; initialParty: number; clientId: string; now?: Date }) {
  const router = useRouter();
  const sizes = useMemo(() => Array.from({ length: item.partyMax - item.partyMin + 1 }, (_, i) => item.partyMin + i), [item.partyMin, item.partyMax]);
  const [party, setParty] = useState(Math.min(Math.max(initialParty, item.partyMin), item.partyMax));
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const live = item.kind === "live";
  const hold = live ? holdFor(item.unitPrice, party) : null;
  const cents = hold ? Math.round(Number(hold.total) * 100) : Math.round(Number(item.unitPrice) * 100) * (item.perGroup ? 1 : party);
  const startsAt = startsAtIso(day, time);
  // Option 3: with the guest's OK, PayPal saves their account so a bill above the hold can be charged to it.
  const [saveConsent, setSaveConsent] = useState(false);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState("");

  useEffect(() => {
    if (!saveConsent || idToken) return;
    let active = true;
    fetch("/api/paypal/id-token")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        if (active) setIdToken(body.idToken);
      })
      .catch(() => {
        if (!active) return;
        setTokenError("We couldn't set up saving your PayPal. You can still book; any difference is paid at the table.");
        setSaveConsent(false);
      });
    return () => { active = false; };
  }, [saveConsent, idToken]);
  const waitingForToken = saveConsent && !idToken;

  async function createOrder(): Promise<string> {
    setError("");
    const res = await fetch("/api/paypal/orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: item.kind, itemId: item.itemId, partySize: party, ...(live && saveConsent && { savePayPal: true }) }),
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
      <WhenPicker day={day} time={time} onDay={setDay} onTime={setTime} now={now} maxDays={live ? 27 : 89} />
      <label>
        Guests
        <select value={party} onChange={(e) => setParty(Number(e.target.value))}>
          {sizes.map((n) => <option key={n} value={n}>{guests(n)}</option>)}
        </select>
      </label>
      {hold && (
        <dl className="hold-lines" role="group" aria-label="What PayPal holds">
          <div><dt>Est. bill ({money(item.unitPrice)} × {guests(party)})</dt><dd>{money(hold.billEstimate)}</dd></div>
          <div><dt>Room for tip and extras (20%)</dt><dd>{money(hold.headroom)}</dd></div>
          <div><dt>kickinit booking fee</dt><dd>{money(hold.fee)}</dd></div>
        </dl>
      )}
      <div className="book-total">
        <span className="pick-meta">
          {live ? "PayPal holds" : item.perGroup ? "Flat price for the group" : `${money(item.unitPrice)} × ${guests(party)}`}
        </span>
        <strong data-testid="total">{money((cents / 100).toFixed(2))}</strong>
      </div>
      {live && (
        <label className="consent">
          <input type="checkbox" checked={saveConsent} onChange={(e) => { setTokenError(""); setSaveConsent(e.target.checked); }} />
          <span>If the final bill is higher than the hold, charge the difference to my PayPal. (Otherwise you pay the difference at the table.)</span>
        </label>
      )}
      {tokenError && <p className="error-note" role="alert">{tokenError}</p>}

      {!clientId ? (
        <p className="error-note">Payments aren&rsquo;t set up yet.</p>
      ) : !startsAt ? (
        <p className="pick-meta" style={{ margin: 0 }}>Choose a date and time to continue.</p>
      ) : waitingForToken ? (
        <div className="concierge-status" role="status"><span className="dot-pulse" aria-hidden="true" /> Setting up PayPal…</div>
      ) : busy ? (
        <div className="concierge-status" role="status"><span className="dot-pulse" aria-hidden="true" /> Securing your booking…</div>
      ) : (
        <PayPalScriptProvider options={{ clientId, intent: "authorize", currency: "USD", ...(saveConsent && idToken && { dataUserIdToken: idToken }) }}>
          <PayPalButtons
            style={{ layout: "horizontal", color: "gold", label: "pay", tagline: false, height: 44 }}
            forceReRender={[party, startsAt, saveConsent]}
            createOrder={createOrder}
            onApprove={onApprove}
            onError={() => setError("PayPal ran into a problem. Nothing was charged; please try again.")}
          />
        </PayPalScriptProvider>
      )}
      {error && <p className="error-note" role="alert">{error}</p>}
      <p className="pick-meta" style={{ margin: 0 }}>
        {live
          ? "Nothing is charged until the venue confirms and the bill closes. Then you pay the real bill plus the booking fee, and the rest of the hold is released."
          : "PayPal holds the amount and it's charged the moment your booking is confirmed."}
      </p>
    </aside>
  );
}
