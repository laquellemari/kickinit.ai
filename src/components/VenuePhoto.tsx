"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { PlacePhoto } from "@/lib/places/client";

/** A venue's Google photo with the photographer credit Google requires. Shows the colour tile until (or unless) a photo loads. */
export function VenuePhoto({ placeId, alt, height, bg = "#E6EDF3", children }: { placeId?: string; alt: string; height: number; bg?: string; children?: ReactNode }) {
  const [photo, setPhoto] = useState<PlacePhoto | null>(null);

  useEffect(() => {
    setPhoto(null);
    if (!placeId) return;
    let live = true;
    fetch(`/api/places/photo/${encodeURIComponent(placeId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: PlacePhoto | null) => { if (live && p) setPhoto(p); })
      .catch(() => {});
    return () => { live = false; };
  }, [placeId]);

  return (
    <div className="postcard-photo" style={{ height, background: bg, overflow: "hidden" }}>
      {photo && (
        // Google photo URLs are short-lived and per-request, so next/image optimisation doesn't apply.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.uri} alt={alt} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      )}
      {children}
      {photo && (
        <span className="photo-credit">
          Photo: {photo.author ? (photo.authorUri ? <a href={photo.authorUri} target="_blank" rel="noopener noreferrer">{photo.author}</a> : photo.author) : "Google Maps"}
          {photo.author ? " · Google Maps" : ""}
        </span>
      )}
    </div>
  );
}
