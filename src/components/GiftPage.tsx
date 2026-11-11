"use client";

import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { useCallback, useEffect, useState } from "react";
import type { GiftView } from "@/lib/gifts/view";
import { guests, money } from "@/lib/format";

function CopyBox({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="caps" style={{ color: "var(--muted)", fontSize: 11 }}>{label}</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input readOnly value={url} aria-label={label} onFocus={(e) => e.currentTarget.select()} style={{ flex: "1 1 260px", minHeight: 44, border: "1px solid var(--line)", padding: "0 10px", font: "400 15px var(--body)", color: "var(--navy)" }} />
        <button
          type="button"
          className="btn-line"
          onClick={() => navigator.clipboard.writeText(url).then(() => setCopied(true), () => setCopied(false))}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

const STATUS: Record<GiftView["status"], string> = {
  open: "",
  funded: "Fully funded. Everyone's been charged and the gift is ready to send.",
  redeemed: "They've redeemed it and booked their time.",
  expired: "This pool closed before reaching the goal, so every hold was released. Nobody was charged.",
};

export function GiftPage({ id, clientId, origin }: { id: string; clientId: string; origin: string }) {
  const [g, setG] = useState<GiftView | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/gifts/${id}`);
    const body = await res.json();
    if (!res.ok) return setError(body.error ?? "Couldn't load this gift.");
    setG(body);
    setAmount((a) => a || (body.mode === "solo" ? body.maxContribution : ""));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!g) return error ? <p className="error-note" role="alert">{error}</p> : <div className="concierge-status" role="status"><span className="dot-pulse" aria-hidden="true" /> Loading the gift…</div>;

  const pct = Math.min(100, Math.round((Number(g.raised) / Number(g.amount)) * 100));
  const amountOk = /^\d+(\.\d{1,2})?$/.test(amount) && Number(amount) >= Number(g.minContribution) && Number(amount) <= Number(g.maxContribution);
  const ready = g.status === "open" && name.trim() && amountOk;

  async function createOrder() {
    setError("");
    const res = await fetch("/api/paypal/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "gift", giftId: id, amount }) });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Couldn't start the payment.");
      throw new Error(body.error);
    }
    return body.id as string;
  }
  async function onApprove(data: { orderID: string }) {
    setBusy(true);
    const res = await fetch(`/api/gifts/${id}/contributions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: data.orderID, name }) });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) return setError(body.error ?? "Your payment didn't go through. Nothing was charged; please try again.");
    setG(body);
    setAmount(body.mode === "solo" ? body.maxContribution : "");
  }

  return (
    <div className="detail-grid">
      <article className="concierge-card" aria-label="Gift" style={{ gap: 16 }}>
        <h2 className="display" style={{ margin: 0, fontSize: 40 }}>A gift for {g.recipientName}</h2>
        <p className="concierge-reply" style={{ margin: 0 }}>{g.name} · {guests(g.partySize)} · from {g.organizerName}</p>
        {g.note && <p className="pick-why" style={{ fontStyle: "italic" }}>&ldquo;{g.note}&rdquo;</p>}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <strong className="display" style={{ fontSize: 30 }} data-testid="raised">{money(g.raised)}</strong>
            <span className="pick-meta">of {money(g.amount)}{g.mode === "pool" && g.status === "open" && ` · closes ${new Date(g.deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}</span>
          </div>
          <div role="progressbar" aria-label="Raised" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} style={{ height: 12, background: "var(--sky)", borderRadius: 999, overflow: "hidden", marginTop: 8 }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "var(--sun)" }} />
          </div>
        </div>
        {g.contributors.length > 0 && (
          <ul aria-label="Contributors" style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {g.contributors.map((c, i) => (
              <li key={i} className="pick-price" style={{ borderTop: i ? undefined : 0, paddingTop: i ? 6 : 0 }}>
                <span>{c.name}</span><span>{money(c.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        {STATUS[g.status] && <p className="concierge-reply" role="status">{STATUS[g.status]}</p>}
        {g.isOrganizer && g.mode === "pool" && g.status === "open" && <CopyBox label="Share this link so friends can chip in" url={`${origin}/gift/${g.id}`} />}
        {g.isOrganizer && g.redeemCode && (g.status === "funded" || g.status === "redeemed") && (
          <CopyBox label={`Send this to ${g.recipientName} to redeem`} url={`${origin}/gift/redeem/${g.redeemCode}`} />
        )}
      </article>

      {g.status === "open" && (
        <aside className="book-panel" aria-label="Chip in">
          <span className="caps" style={{ color: "var(--muted)" }}>{g.mode === "pool" ? "Chip in" : "Pay for the gift"}</span>
          <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
          <label>
            Amount (USD)
            <input inputMode="decimal" value={amount} readOnly={g.mode === "solo"} onChange={(e) => setAmount(e.target.value.trim())} placeholder={`${g.minContribution} – ${g.maxContribution}`} />
          </label>
          <span className="pick-meta">{g.mode === "pool" ? `Between ${money(g.minContribution)} and ${money(g.maxContribution)}` : `${money(g.maxContribution)} in full`}</span>
          {!clientId ? (
            <p className="error-note">Payments aren&rsquo;t set up yet.</p>
          ) : !ready ? (
            <p className="pick-meta" style={{ margin: 0 }}>Add your name and an amount to continue.</p>
          ) : busy ? (
            <div className="concierge-status" role="status"><span className="dot-pulse" aria-hidden="true" /> Adding your share…</div>
          ) : (
            <PayPalScriptProvider options={{ clientId, intent: "authorize", currency: "USD" }}>
              <PayPalButtons
                style={{ layout: "horizontal", color: "gold", label: "pay", tagline: false, height: 44 }}
                forceReRender={[amount, name]}
                createOrder={createOrder}
                onApprove={onApprove}
                onError={() => setError("PayPal ran into a problem. Nothing was charged; please try again.")}
              />
            </PayPalScriptProvider>
          )}
          {error && <p className="error-note" role="alert">{error}</p>}
          <p className="pick-meta" style={{ margin: 0 }}>
            {g.mode === "pool" ? "Your PayPal is only held until the pool hits its goal. If it closes short, the hold is released." : "Charged once PayPal confirms."}
          </p>
        </aside>
      )}
    </div>
  );
}
