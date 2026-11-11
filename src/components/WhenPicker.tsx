"use client";

import { isoDay, slotLabel, TIME_SLOTS } from "@/lib/slots";

const DAY = 86_400_000;

/** Date + half-hour time slot, today through `maxDays` out (89 for partners; 27 for request-to-book, inside PayPal's hold window). */
export function WhenPicker({ day, time, onDay, onTime, now, maxDays = 89 }: { day: string; time: string; onDay: (v: string) => void; onTime: (v: string) => void; now: Date; maxDays?: number }) {
  return (
    <>
      <label>
        Date
        <input type="date" value={day} min={isoDay(now)} max={isoDay(new Date(now.getTime() + maxDays * DAY))} onChange={(e) => onDay(e.target.value)} />
      </label>
      <label>
        Time
        <select value={time} onChange={(e) => onTime(e.target.value)}>
          <option value="">Choose a time</option>
          {TIME_SLOTS.map((t) => <option key={t} value={t}>{slotLabel(t)}</option>)}
        </select>
      </label>
    </>
  );
}
