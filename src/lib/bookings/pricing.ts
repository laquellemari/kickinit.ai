import { getExperience, quote } from "@/lib/catalog/catalog";
import type { Quote } from "@/lib/catalog/types";
import { getLivePlace } from "@/lib/places/client";
import type { LivePlace } from "@/lib/places/types";
import { isDiningExperience, withFee } from "@/lib/pricing/fees";
import { menuFor } from "@/lib/pricing/menu-store";
import { liveFacts, partnerFacts, type VenueFacts } from "./venue";

export type ItemKind = "partner" | "live";

/** A quote with kickinit's fee broken out. `free` bookings (restaurants and bars) take no payment at all. */
export type PricedQuote = Quote & { venueTotal: string; fee: string; free: boolean; serviceId: string | null; serviceName: string | null };

/** The one place prices come from: the partner catalog, or the venue's own published prices for request-to-book. */
export type Priced = { kind: ItemKind; quote: PricedQuote; name: string; factsAt: (startsAt: Date) => VenueFacts };

export class PriceError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "PriceError";
  }
}

const cents = (v: string) => Math.round(Number(v) * 100);
const FREE = { venueTotal: "0.00", fee: "0.00", total: "0.00" };
const suffixFor = (n: number) => ` · ${n} ${n === 1 ? "guest" : "guests"}`;

export async function priceFor(kind: unknown, itemId: unknown, partySize: number, opts: { serviceId?: unknown; member?: boolean } = {}): Promise<Priced> {
  if (kind !== "partner" && kind !== "live") throw new PriceError(400, "Kind must be partner or live");
  if (typeof itemId !== "string" || !itemId) throw new PriceError(400, "Item id is required");
  const member = opts.member === true;
  if (kind === "partner") {
    let q: Quote;
    try {
      q = quote(itemId, partySize);
    } catch (err) {
      const msg = (err as Error).message;
      throw new PriceError(msg.startsWith("Experience not found") ? 404 : 400, msg);
    }
    const free = isDiningExperience(getExperience(itemId)!);
    const fees = free ? FREE : withFee(cents(q.total), member);
    return {
      kind, name: q.description.replace(/ · .*$/, ""), factsAt: (at) => partnerFacts(itemId, at),
      quote: { ...q, ...fees, free, serviceId: null, serviceName: null },
    };
  }

  if (!itemId.startsWith("gp:")) throw new PriceError(400, "Live item ids start with gp:");
  if (!Number.isInteger(partySize) || partySize < 1 || partySize > 20) throw new PriceError(400, "Party size must be a whole number from 1 to 20");
  const place: LivePlace = await getLivePlace(itemId.slice(3));
  const base = { experienceId: place.id, partySize, currency: "USD" };
  const priced = (q: PricedQuote): Priced => ({ kind, quote: q, name: place.name, factsAt: (at) => liveFacts(place, at) });
  if (place.dining) {
    const suffix = suffixFor(partySize);
    return priced({ ...base, ...FREE, unitPrice: "0.00", free: true, serviceId: null, serviceName: null, description: place.name.slice(0, 127 - suffix.length) + suffix });
  }
  if (typeof opts.serviceId !== "string" || !opts.serviceId) throw new PriceError(400, "Pick one of the venue's listed prices");
  const menu = await menuFor(place);
  if (!menu.items.length) throw new PriceError(409, "This venue doesn't publish its prices, so it can't be booked through kickinit yet");
  const item = menu.items.find((i) => i.id === opts.serviceId);
  if (!item) throw new PriceError(400, "That price isn't on the venue's menu anymore. Pick another");
  const venueCents = cents(item.price) * (item.per === "person" ? partySize : 1);
  const suffix = suffixFor(partySize);
  const label = `${place.name}: ${item.name}`;
  return priced({
    ...base, ...withFee(venueCents, member), unitPrice: item.price, free: false, serviceId: item.id, serviceName: item.name,
    description: label.slice(0, 127 - suffix.length) + suffix,
  });
}
