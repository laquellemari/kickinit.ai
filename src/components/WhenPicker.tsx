"use client";

import { isoDay, slotLabel, TIME_SLOTS } from "@/lib/slots";

const DAY = 86_400_000;

/** Date + half-hour time slot, today through 89 days out. */
export function WhenPicker({ day, time, onDay, onTime, now }: { day: string; time: string; onDay: (v: string) => void; onTime: (v: string) => void; now: Date }) {
  return (
    <>
      <label>
        Date
        <input type="date" value={day} min={isoDay(now)} max={isoDay(new Date(now.getTime() + 89 * DAY))} onChange={(e) => onDay(e.target.value)} />
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
