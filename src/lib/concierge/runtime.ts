import { anthropic } from "@ai-sdk/anthropic";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import type { ToolSet } from "ai";
import { searchLivePlaces } from "@/lib/places/client";
import type { SearchLive } from "./agent";

export const DEFAULT_MODEL = "claude-sonnet-5-5";

export function conciergeModel() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Concierge is not configured");
  return anthropic(process.env.CONCIERGE_MODEL || DEFAULT_MODEL);
}

/** PayPal Agent Toolkit tools for the concierge: read-only order lookup. Empty when PayPal isn't configured. */
export function paypalTools(): ToolSet {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret || clientId === "pending") return {};
  const toolkit = new PayPalAgentToolkit({
    clientId,
    clientSecret,
    configuration: { actions: { orders: { get: true } }, context: { sandbox: process.env.PAYPAL_ENV !== "live" } },
  });
  return toolkit.getTools() as ToolSet;
}

/** Google Places live search, when a key is configured. */
export function liveSearch(): SearchLive | undefined {
  return process.env.GOOGLE_PLACES_API_KEY ? searchLivePlaces : undefined;
}
