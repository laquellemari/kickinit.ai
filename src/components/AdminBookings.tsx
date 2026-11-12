"use client";

import { useCallback, useEffect, useState } from "react";
import type { PublicBooking } from "@/lib/bookings/public";
import { guests, money } from "@/lib/format";

const KEY = "kickinit-admin-key";
const read = () => { try { return sessionStorage.getItem(KEY) ?? ""; } catch { return ""; } };
const save = (v: string) => { try { sessionStorage.setItem(KEY, v); } catch { /* private mode */ } };

/** Stand-in for kickinit's concierge desk: confirm or decline requests (after checking with the venue) and check guests in. */
export function AdminBookings() {
  const [key, setKey] = useState("");
  const [draft, setDraft] = useState("");
  const [list, setList] = useState<PublicBooking[] | null>(null);
  const [toCheckIn, setToCheckIn] = useState<PublicBooking[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (k: string) => {
    setError("");
    const res = await fetch("/api/admin/bookings?status=held", { headers: { "x-admin-key": k } });
    const body = await res.json();
    if (!res.ok) {
      setList(null);
      setError(body.error);
      return;
    }
    setList(body.bookings);
    const conf = await fetch("/api/admin/bookings?status=confirmed", { headers: { "x-admin-key": k } });
    const cb = await conf.json();
    const confirmed: PublicBooking[] = conf.ok ? cb.bookings : [];
    setToCheckIn(confirmed.filter((x) => !x.checkedInAt));
  }, []);

  useEffect(() => {
    const k = read();
    if (k) {
      setKey(k);
      void load(k);
    }
  }, [load]);

  async function act(id: string, action: "confirm" | "decline" | "check-in") {
    setBusy(id);
    const res = await fetch(`/api/bookings/${id}/${action}`, { method: "POST", headers: { "x-admin-key": key } });
    const body = await res.json();
    setBusy(null);
    if (!res.ok) return setError(body.error);
    await load(key);
  }

  if (!key || !list) {
    return (
      <form className="concierge-card" onSubmit={(e) => { e.preventDefault(); save(draft); setKey(draft); void load(draft); }}>
        <label htmlFor="admin-key" className="caps" style={{ color: "var(--muted)" }}>Admin key</label>
        <input id="admin-key" type="password" value={draft} onChange={(e) => setDraft(e.target.value)} className="ask-input" style={{ minHeight: 44, border: "1px solid var(--line)", padding: "0 10px", font: "400 16px var(--body)" }} />
        <button type="submit" className="btn-navy" style={{ alignSelf: "flex-start" }}>Open requests</button>
        {error && <p className="error-note" role="alert">{error}</p>}
      </form>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
    <section className="concierge-card" aria-label="Requests waiting for the venue">
      {error && <p className="error-note" role="alert">{error}</p>}
      {list.length === 0 && <p className="concierge-reply">No requests waiting. Everything&rsquo;s confirmed or released.</p>}
      {list.map((b) => (
        <div key={b.id} className="pick-price" style={{ flexWrap: "wrap" }} aria-label={b.name}>
          <div>
            <strong style={{ fontSize: 20 }}>{b.name}</strong>
            <div className="pick-meta">{new Date(b.startsAt).toLocaleString()} · {guests(b.partySize)}{b.serviceName ? ` · ${b.serviceName}` : ""} · {b.free ? "free booking" : `${money(b.amount)} on hold`}</div>
          </div>
          <div className="pick-actions">
            <button className="btn-navy" disabled={busy === b.id} onClick={() => act(b.id, "confirm")}>{b.free ? "Confirm" : "Confirm & charge"}</button>
            <button className="btn-line" disabled={busy === b.id} onClick={() => act(b.id, "decline")}>Decline &amp; release</button>
          </div>
        </div>
      ))}
    </section>
    <section className="concierge-card" aria-label="Confirmed, not yet checked in">
      <h2 className="display" style={{ margin: 0, fontSize: 28 }}>Arrivals</h2>
      {toCheckIn.length === 0 && <p className="pick-meta">No confirmed guests waiting to check in.</p>}
      {toCheckIn.map((b) => (
        <div key={b.id} className="pick-price" style={{ flexWrap: "wrap" }} aria-label={`Arrival: ${b.name}`}>
          <div>
            <strong style={{ fontSize: 20 }}>{b.name}</strong>
            <div className="pick-meta">{new Date(b.startsAt).toLocaleString()} · {guests(b.partySize)}</div>
          </div>
          <button className="btn-navy" disabled={busy === b.id} onClick={() => act(b.id, "check-in")}>Check in</button>
        </div>
      ))}
    </section>
    </div>
  );
}
