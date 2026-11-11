import type { Booking } from "./repo";

/** What the browser sees: no visitor id or PayPal authorization id. */
export function publicBooking(b: Booking) {
  return {
    id: b.id, kind: b.kind, itemId: b.itemId, name: b.name, partySize: b.partySize, startsAt: b.startsAt.toISOString(),
    amount: b.amount, currency: b.currency, status: b.status, paypalOrderId: b.paypalOrderId,
    holdExpiresAt: b.holdExpiresAt?.toISOString() ?? null, createdAt: b.createdAt.toISOString(),
    checkedInAt: b.checkedInAt?.toISOString() ?? null, city: b.facts.city,
    fee: b.fee, overageConsent: b.vaultId !== null,
    settlement: b.settlement && {
      billTotal: b.settlement.billTotal, capturedTotal: b.settlement.capturedTotal, overage: b.settlement.overage,
      overageStatus: b.settlement.overageStatus, settledAt: b.settlement.settledAt.toISOString(),
    },
  };
}
export type PublicBooking = ReturnType<typeof publicBooking>;
