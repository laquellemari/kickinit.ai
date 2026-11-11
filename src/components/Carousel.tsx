"use client";

import { useEffect, useState } from "react";

export type Slide = { title: string; where: string; photo: string; stamp: string; bg: string };

export function Carousel({ slides }: { slides: Slide[] }) {
  const [i, setI] = useState(0);
  const n = slides.length;
  const s = slides[i];

  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % n), 6000);
    return () => clearInterval(t);
  }, [n]);

  return (
    <div className="carousel" aria-roledescription="carousel" aria-label="This week's experiences">
      <div className="postcard" aria-live="polite">
        <div className="postcard-photo" style={{ height: 280, background: s.bg }}>
          [Photo: {s.photo}]
          <span className="stamp">{s.stamp}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <span className="display" style={{ fontWeight: 800, fontSize: 28 }}>{s.title}</span>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{s.where}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button type="button" aria-label="Previous" className="round-btn" onClick={() => setI((i + n - 1) % n)}
          style={{ border: "1px solid var(--sun)", background: "transparent", color: "var(--sun)" }}>‹</button>
        <span style={{ fontSize: 13, color: "var(--on-navy)", letterSpacing: "0.14em" }}>
          {String(i + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
        </span>
        <button type="button" aria-label="Next" className="round-btn" onClick={() => setI((i + 1) % n)}
          style={{ border: 0, background: "var(--sun)", color: "var(--navy)" }}>›</button>
      </div>
    </div>
  );
}
