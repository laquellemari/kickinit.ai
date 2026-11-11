import { anthropic } from "@ai-sdk/anthropic";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { wrapLanguageModel, type LanguageModelV1Middleware, type ToolSet } from "ai";
import { searchLivePlaces } from "@/lib/places/client";
import type { SearchLive } from "./agent";

export const DEFAULT_MODEL = "claude-sonnet-5-5";

/**
 * AI SDK v4 always sends temperature (defaulting to 0), but current Claude models reject it.
 * Strip it so the request uses the model's default.
 */
export const stripTemperature: LanguageModelV1Middleware = {
  transformParams: async ({ params }) => ({ ...params, temperature: undefined }),
};

export function conciergeModel() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Concierge is not configured");
  return wrapLanguageModel({ model: anthropic(process.env.CONCIERGE_MODEL || DEFAULT_MODEL), middleware: stripTemperature });
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
