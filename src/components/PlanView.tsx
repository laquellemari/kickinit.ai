"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConciergeResult, HistoryItem, Mode } from "@/lib/concierge/agent";
import { Nav } from "./Nav";
import { PickCard } from "./PickCard";

type Status = "idle" | "loading" | "done" | "error";

const ERRORS: Record<number, string> = {
  429: "That's a lot of requests in a minute. Give it a moment and try again.",
  503: "The concierge is offline right now. Please try again shortly.",
};

export function PlanView({ q, mode, where }: { q: string; mode: Mode; where: string }) {
  const [status, setStatus] = useState<Status>(q ? "loading" : "idle");
  const [result, setResult] = useState<ConciergeResult | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [asked, setAsked] = useState(q);
  const [refine, setRefine] = useState("");
  const started = useRef(false);

  const ask = useCallback(
    async (message: string, prior: HistoryItem[]) => {
      setStatus("loading");
      setAsked(message);
      setError("");
      try {
        const res = await fetch("/api/concierge", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message, mode, where, history: prior }),
        });
        const body = await res.json();
        if (!res.ok) throw Object.assign(new Error(body.error), { status: res.status });
        setResult(body);
        setHistory([...prior, { role: "user", content: message }, { role: "assistant", content: body.reply }]);
        setStatus("done");
      } catch (err) {
        const s = (err as { status?: number }).status;
        setError((s && ERRORS[s]) || "Something went wrong finding options. Please try again.");
        setStatus("error");
      }
    },
    [mode, where],
  );

  useEffect(() => {
    if (q && !started.current) {
      started.current = true;
      void ask(q, []);
    }
  }, [q, ask]);

  const party = result?.partySize ?? 2;

  return (
    <div style={{ minHeight: "100vh" }}>
      <section className="hero">
        <Nav active={mode === "them" ? "gifts" : "explore"} region={where} />
        <div className="wrap plan-hero">
          <div className="eyebrow">{mode === "them" ? "For them" : "For you"} · {where}</div>
          <h1 className="display">{mode === "them" ? "Gift ideas." : "Here's the plan."}</h1>
          {asked && <p className="plan-ask">&ldquo;{asked}&rdquo;</p>}
        </div>
      </section>

      <main className="plan-main">
        <section className="concierge-card" aria-label="Concierge">
          {status === "idle" && (
            <p className="concierge-reply">
              Tell us what you&rsquo;re in the mood for on the <Link href="/">home page</Link> and we&rsquo;ll plan it.
            </p>
          )}
          {status === "loading" && (
            <div className="concierge-status" role="status">
              <span className="dot-pulse" aria-hidden="true" /> Finding the table, the treatment or the trip…
            </div>
          )}
          {status === "error" && <p className="error-note" role="alert">{error}</p>}
          {status === "done" && result && <p className="concierge-reply">{result.reply}</p>}

          {(status === "done" || status === "error") && (
            <form
              className="refine"
              onSubmit={(e) => {
                e.preventDefault();
                const m = refine.trim();
                if (!m) return;
                setRefine("");
                void ask(m, history);
              }}
            >
              <label htmlFor="refine" style={{ fontSize: 14, color: "var(--muted)" }}>Refine it:</label>
              <input id="refine" value={refine} onChange={(e) => setRefine(e.target.value)} placeholder="cheaper, later, somewhere quieter…" />
              <button type="submit" className="text-btn">Update →</button>
            </form>
          )}
        </section>

        {status === "done" && result && result.options.length > 0 && (
          <section aria-label="Options">
            <div className="legend">
              <span><strong>Instant book</strong>: kickinit partner, fixed price.</span>
              <span><strong>Request</strong>: we hold an estimate on PayPal; you&rsquo;re only charged once the venue confirms.</span>
            </div>
            <div className="pick-grid" style={{ marginTop: 18 }}>
              {result.options.map((o) => (
                <PickCard key={o.kind === "partner" ? o.experience.id : o.place.id} pick={o} partySize={party} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
