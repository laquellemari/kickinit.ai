"use client";

import { useEffect, useState } from "react";

/**
 * The venue's description, written from its Google Maps details. `fallback` shows until it arrives, and stays if
 * there's none (or the lookup fails).
 */
export function VenueAbout({ placeId, fallback, className }: { placeId: string; fallback: string; className: string }) {
  const [about, setAbout] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/places/${placeId}/about`)
      .then(async (res) => {
        const body = await res.json();
        if (active && res.ok && typeof body.about === "string") setAbout(body.about);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [placeId]);

  return <p className={className} data-testid="venue-about">{about ?? fallback}</p>;
}
