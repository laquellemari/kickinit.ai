/** "$1,234.50" or "$180" for whole dollars. */
export function money(value: string, currency = "USD"): string {
  const n = Number(value);
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);
}

export const guests = (n: number) => `${n} ${n === 1 ? "guest" : "guests"}`;

export function duration(minutes: number): string {
  if (minutes >= 1440) return `${Math.round(minutes / 1440)} ${Math.round(minutes / 1440) === 1 ? "day" : "days"}`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} hr` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
}
