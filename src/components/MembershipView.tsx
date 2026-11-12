"use client";

import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { useEffect, useState } from "react";
import { MEMBERSHIP_PRICE } from "@/lib/pricing/fees";

type State = { member: boolean; status: string | null; since: string | null };

/** Join (PayPal Subscriptions, $9.99/month) or cancel. Members pay no concierge fee. */
export function MembershipView({ clientId }: { clientId: string }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/membership")
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        setState(body);
      })
      .catch((err: Error) => setError(err.message || "Couldn't load your membership."));
  }, []);

  async function post(path: string, body?: unknown) {
    const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
    return json;
  }

  async function createSubscription(): Promise<string> {
    setError("");
    try {
      return (await post("/api/membership/subscription")).id;
    } catch (err) {
      setError((err as Error).message || "Couldn't start the subscription.");
      throw err;
    }
  }

  async function onApprove(data: { subscriptionID?: string | null }) {
    setBusy(true);
    try {
      setState(await post("/api/membership/activate", { subscriptionId: data.subscriptionID }));
    } catch (err) {
      setError((err as Error).message || "PayPal approved it, but we couldn't turn your membership on. Reload in a minute.");
    }
    setBusy(false);
  }

  async function cancel() {
    setBusy(true);
    setError("");
    try {
      const r = await post("/api/membership/cancel");
      setState({ ...state!, member: false, status: r.status });
    } catch (err) {
      setError((err as Error).message || "Couldn't cancel. Try again.");
    }
    setBusy(false);
  }

  return (
    <article className="concierge-card member-card" aria-label="Membership">
      <h2 className="display" style={{ margin: 0, fontSize: 36 }}>No fees, ever. ${MEMBERSHIP_PRICE} a month.</h2>
      <ul className="concierge-reply" style={{ margin: 0, paddingLeft: 20 }}>
        <li>Spas, classes, tours, getaways and gifts: pay the venue&rsquo;s exact price, without our 20% concierge fee.</li>
        <li>Restaurants and bars stay free to book for everyone.</li>
        <li>Billed monthly with PayPal. Cancel here any time.</li>
      </ul>
      {error && <p className="error-note" role="alert">{error}</p>}
      {!state && !error ? (
        <div className="concierge-status" role="status"><span className="dot-pulse" aria-hidden="true" /> Checking your membership…</div>
      ) : state?.member ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p className="concierge-reply" role="status" style={{ margin: 0 }}>You&rsquo;re a member{state.since ? ` since ${new Date(state.since).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` : ""}. No concierge fees on your bookings.</p>
          <button type="button" className="btn-line" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={cancel}>Cancel membership</button>
        </div>
      ) : busy ? (
        <div className="concierge-status" role="status"><span className="dot-pulse" aria-hidden="true" /> Turning on your membership…</div>
      ) : state && !clientId ? (
        <p className="error-note">Payments aren&rsquo;t set up yet.</p>
      ) : state ? (
        <>
          {state.status === "CANCELLED" && <p className="pick-meta" style={{ margin: 0 }}>Your membership is cancelled. You can join again below.</p>}
          <PayPalScriptProvider options={{ clientId, vault: true, intent: "subscription" }}>
            <PayPalButtons
              style={{ layout: "horizontal", color: "gold", label: "subscribe", tagline: false, height: 44 }}
              createSubscription={createSubscription}
              onApprove={onApprove}
              onError={() => setError("PayPal ran into a problem. Nothing was charged; please try again.")}
            />
          </PayPalScriptProvider>
        </>
      ) : null}
    </article>
  );
}
