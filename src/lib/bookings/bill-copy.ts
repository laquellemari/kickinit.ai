import { money } from "@/lib/format";
import type { PublicBooking } from "./public";

export type Copy = { title: string; stamp: string; body: string; amountLabel: string; amount: string; alert?: boolean };
const cents = (v: string) => Math.round(Number(v) * 100);
const fromCents = (c: number) => (c / 100).toFixed(2);

/** What a request-to-book guest sees at each step: requested, reserved, then how the bill was paid. */
export function liveCopy(b: PublicBooking): Copy | null {
  if (b.kind !== "live" || (b.status !== "held" && b.status !== "confirmed")) return null;
  const fee = money(b.fee ?? "0.00");
  const hold = money(b.amount);
  const s = b.settlement;
  if (b.status === "held") {
    return { title: "Request sent.", stamp: "ON HOLD", amountLabel: "Held", amount: b.amount,
      body: `PayPal is holding ${hold}: your estimated bill, room for tip, and the ${fee} booking fee. Nothing is charged unless the venue confirms; if they can't take you, the hold is released.` };
  }
  if (!s) {
    const over = b.overageConsent ? "If the bill comes in higher, the difference goes on your saved PayPal." : "If the bill comes in higher, you'll pay the difference at the table.";
    return { title: "You're booked.", stamp: "RESERVED", amountLabel: "Held", amount: b.amount,
      body: `The venue confirmed. PayPal is holding ${hold}. When the bill closes you're charged the real bill plus the ${fee} booking fee, and the rest is released. ${over}` };
  }
  const head = `Bill ${money(s.billTotal)} + ${fee} booking fee.`;
  if (s.overageStatus === "none") {
    const released = cents(b.amount) - cents(s.capturedTotal);
    return { title: "Bill paid.", stamp: "PAID", amountLabel: "Charged", amount: s.capturedTotal,
      body: `${head} ${money(s.capturedTotal)} charged from your hold${released > 0 ? `; ${money(fromCents(released))} released back to you` : ""}.` };
  }
  if (s.overageStatus === "charged") {
    return { title: "Bill paid.", stamp: "PAID", amountLabel: "Charged", amount: fromCents(cents(s.capturedTotal) + cents(s.overage)),
      body: `${head} ${money(s.capturedTotal)} came from your hold and ${money(s.overage)} was charged to your saved PayPal.` };
  }
  return { title: "Almost done.", stamp: "PAY AT TABLE", amountLabel: "Charged", amount: s.capturedTotal, alert: true,
    body: `${head} ${money(s.capturedTotal)} came from your hold. Please pay the remaining ${money(s.overage)} at the table.` };
}
