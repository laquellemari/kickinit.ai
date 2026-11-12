"use client";

import { useEffect, useState } from "react";

/** Whether this visitor is a member (no concierge fee). Display only: the server always sets the price. */
export function useMember(given?: boolean, skip = false): boolean {
  const [fetched, setFetched] = useState(false);
  useEffect(() => {
    if (given !== undefined || skip) return;
    let active = true;
    fetch("/api/membership")
      .then((res) => (res.ok ? res.json() : { member: false }))
      .then((body: { member?: boolean }) => { if (active) setFetched(body.member === true); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [given, skip]);
  return given ?? fetched;
}
