/** Half-hour start times from 09:00 to 22:00. */
export const TIME_SLOTS: string[] = Array.from({ length: 27 }, (_, i) => {
  const mins = 9 * 60 + i * 30;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${mins % 60 === 0 ? "00" : "30"}`;
});

export function slotLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** yyyy-mm-dd for a Date in local time. */
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Local date + time → ISO instant, or null if either is missing. */
export function startsAtIso(day: string, time: string): string | null {
  if (!day || !time) return null;
  const d = new Date(`${day}T${time}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
