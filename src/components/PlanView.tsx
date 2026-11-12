"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConciergeResult, HistoryItem, Mode } from "@/lib/concierge/agent";
import { Nav } from "./Nav";
import { PickCard } from "./PickCard";
import { PlanLoading, type ExploreItem, type QuestTeaser } from "./PlanLoading";

type Status = "idle" | "loading" | "done" | "error";

/** Results show 2 rows of 4; each "Show more" adds 2 more rows. */
export const PAGE = 8;

const ERRORS: Record<number, string> = {
  429: "That's a lot of requests in a minute. Give it a moment and try again.",
  503: "The concierge is offline right now. Please try again shortly.",
};

export function PlanView({ q, mode, where, explore, teasers }: { q: string; mode: Mode; where: string; explore?: ExploreItem[]; teasers?: QuestTeaser[] }) {
  const [status, setStatus] = useState<Status>(q ? "loading" : "idle");
  const [result, setResult] = useState<ConciergeResult | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [asked, setAsked] = useState(q);
  const [refine, setRefine] = useState("");
  const [shown, setShown] = useState(PAGE);
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
        setShown(PAGE);
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
        {status !== "loading" && (
        <section className="concierge-card" aria-label="Concierge">
          {status === "idle" && (
            <p className="concierge-reply">
              Tell us what you&rsquo;re in the mood for on the <Link href="/">home page</Link> and we&rsquo;ll plan it.
            </p>
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
        )}

        {status === "loading" && <PlanLoading explore={explore} teasers={teasers} />}

        {status === "done" && result && result.options.length > 0 && (
          <section aria-label="Options">
            <div className="legend">
              <span><strong>Instant book</strong>: kickinit partner, fixed price.</span>
              <span><strong>Request</strong>: the venue&rsquo;s own exact price, charged only once the venue confirms. Restaurants and bars are free to book.</span>
              <span><strong>Tickets</strong>: real shows and games, bought on Ticketmaster.</span>
            </div>
            <p className="pick-meta" style={{ margin: "8px 0 0" }}>
              Showing {Math.min(shown, result.options.length)} of {result.options.length} options
            </p>
            <div className="pick-grid pick-grid-4" style={{ marginTop: 18 }}>
              {result.options.slice(0, shown).map((o) => (
                <PickCard key={o.kind === "partner" ? o.experience.id : o.kind === "event" ? o.event.id : o.place.id} pick={o} partySize={party} gift={mode === "them"} />
              ))}
            </div>
            {shown < result.options.length && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 28 }}>
                <button type="button" className="btn-navy" onClick={() => setShown((n) => n + PAGE)}>
                  Show more
                </button>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
