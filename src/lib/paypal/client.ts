/**
 * PayPal REST client for the hold → charge / cancel flow:
 *   createHoldOrder (intent AUTHORIZE) → buyer approves in the PayPal popup →
 *   authorizeOrder (funds held) → captureAuthorization (venue confirmed) or voidAuthorization (venue declined).
 */

export const MAX_AMOUNT = "10000.00";
const MAX_CENTS = 1_000_000;
const ID_RE = /^[A-Za-z0-9-]{1,36}$/;
const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;
const BASE_URLS = { sandbox: "https://api-m.sandbox.paypal.com", live: "https://api-m.paypal.com" } as const;

export class PayPalError extends Error {
  constructor(public status: number, public issue: string, message: string, public debugId?: string) {
    super(message);
    this.name = "PayPalError";
  }
}

export type Money = { value: string; currency: string };
export type HoldOrderInput = {
  amount: string; currency: string; description: string; referenceId: string; requestId: string;
  /** Save the buyer's PayPal with this hold so we can charge any amount above it later (they agreed at checkout). */
  savePayPal?: { returnUrl: string; cancelUrl: string };
};

function config() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  const env = process.env.PAYPAL_ENV || "sandbox";
  if (!clientId || !secret) throw new Error("PayPal credentials are not configured");
  if (env !== "sandbox" && env !== "live") throw new Error("PAYPAL_ENV must be sandbox or live");
  return { clientId, secret, baseUrl: BASE_URLS[env] };
}

let cached: { token: string; expiresAt: number } | null = null;
export function resetTokenCache() {
  cached = null;
}

export async function getAccessToken(): Promise<string> {
  const { clientId, secret, baseUrl } = config();
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token;

  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: { authorization: `Basic ${btoa(`${clientId}:${secret}`)}`, "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const body = await res.json();
  if (!res.ok) throw new PayPalError(res.status, body.error, `PayPal auth failed: ${body.error_description}`);
  cached = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

async function call<T>(path: string, requestId: string, body?: unknown): Promise<T | null> {
  const { baseUrl } = config();
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "paypal-request-id": requestId, prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const issue = json?.details?.[0]?.issue ?? json?.name ?? "UNKNOWN";
    throw new PayPalError(res.status, issue, `PayPal ${issue}: ${json?.message ?? `HTTP ${res.status}`}`, json?.debug_id);
  }
  return json as T | null;
}

function checkAmount(value: string): void {
  if (!AMOUNT_RE.test(value)) throw new Error("Amount must be a decimal like 180.00");
  const cents = Math.round(Number(value) * 100);
  if (cents <= 0) throw new Error("Amount must be greater than zero");
  if (cents > MAX_CENTS) throw new Error(`Amount cannot exceed ${MAX_AMOUNT}`);
}

function checkCurrency(c: string): void {
  if (!/^[A-Z]{3}$/.test(c)) throw new Error("Currency must be a 3-letter code like USD");
}

function checkId(id: string, label: "Order" | "Authorization"): void {
  if (!id) throw new Error(`${label} id is required`);
  if (!ID_RE.test(id)) throw new Error(`${label} id has invalid characters`);
}

function checkRequestId(id: string): void {
  if (!id) throw new Error("Request id is required for idempotency");
}

export async function createHoldOrder(input: HoldOrderInput): Promise<{ id: string; status: string }> {
  checkAmount(input.amount);
  checkCurrency(input.currency);
  if (!input.description.trim()) throw new Error("Description is required");
  if (input.description.length > 127) throw new Error("Description cannot exceed 127 characters");
  if (!input.referenceId) throw new Error("Reference id is required");
  checkRequestId(input.requestId);

  const order = await call<{ id: string; status: string }>("/v2/checkout/orders", input.requestId, {
    intent: "AUTHORIZE",
    purchase_units: [
      { reference_id: input.referenceId, description: input.description, amount: { currency_code: input.currency, value: input.amount } },
    ],
    ...(input.savePayPal && {
      payment_source: {
        paypal: {
          attributes: { vault: { store_in_vault: "ON_SUCCESS", usage_type: "MERCHANT", customer_type: "CONSUMER" } },
          experience_context: { return_url: input.savePayPal.returnUrl, cancel_url: input.savePayPal.cancelUrl },
        },
      },
    }),
  });
  return { id: order!.id, status: order!.status };
}

type AuthorizedOrder = {
  id: string;
  payment_source?: { paypal?: { attributes?: { vault?: { id?: string; status?: string } } } };
  purchase_units?: {
    payments?: { authorizations?: { id: string; status: string; expiration_time: string; amount?: { value: string; currency_code: string } }[] };
  }[];
};

export async function authorizeOrder(orderId: string, requestId: string) {
  checkId(orderId, "Order");
  checkRequestId(requestId);
  const order = await call<AuthorizedOrder>(`/v2/checkout/orders/${orderId}/authorize`, requestId, {});
  const auth = order?.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!auth) throw new Error(`PayPal returned no authorization for order ${orderId}`);
  return {
    orderId,
    authorizationId: auth.id,
    status: auth.status,
    expiresAt: auth.expiration_time,
    amount: auth.amount ? { value: auth.amount.value, currency: auth.amount.currency_code } : null,
    /** Set only when PayPal saved the buyer's account (status VAULTED); "APPROVED" means it wasn't saved. */
    vaultId: savedVaultId(order),
  };
}

function savedVaultId(order: AuthorizedOrder | null): string | null {
  const v = order?.payment_source?.paypal?.attributes?.vault;
  return v?.status === "VAULTED" && v.id ? v.id : null;
}

export type SavedChargeInput = { vaultId: string; amount: string; currency: string; description: string; referenceId: string; requestId: string };

/** Charge a buyer's saved PayPal without them present (they agreed when booking). Returns the capture id. */
export async function chargeSavedPayPal(input: SavedChargeInput): Promise<{ orderId: string; captureId: string }> {
  if (!input.vaultId || !ID_RE.test(input.vaultId)) throw new Error("Saved PayPal id is missing or invalid");
  checkAmount(input.amount);
  checkCurrency(input.currency);
  if (!input.description.trim() || input.description.length > 127) throw new Error("Description must be 1 to 127 characters");
  checkRequestId(input.requestId);
  const order = await call<{ id: string; status: string; purchase_units?: { payments?: { captures?: { id: string; status: string }[] } }[] }>(
    "/v2/checkout/orders",
    input.requestId,
    {
      intent: "CAPTURE",
      purchase_units: [{ reference_id: input.referenceId, description: input.description, amount: { currency_code: input.currency, value: input.amount } }],
      payment_source: { paypal: { vault_id: input.vaultId } },
    },
  );
  const capture = order?.purchase_units?.[0]?.payments?.captures?.[0];
  if (order?.status !== "COMPLETED" || !capture) throw new PayPalError(422, "NOT_COMPLETED", `PayPal didn't complete the charge (status ${order?.status ?? "none"})`);
  return { orderId: order.id, captureId: capture.id };
}

/** A short-lived id token the JS SDK needs (data-user-id-token) to save a buyer's PayPal during checkout. */
export async function getIdToken(): Promise<string> {
  const { clientId, secret, baseUrl } = config();
  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: { authorization: `Basic ${btoa(`${clientId}:${secret}`)}`, "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&response_type=id_token",
  });
  const body = await res.json();
  if (!res.ok || !body.id_token) throw new PayPalError(res.status, body.error ?? "NO_ID_TOKEN", `PayPal id token failed: ${body.error_description ?? "no id_token returned"}`);
  return body.id_token;
}

export async function captureAuthorization(authorizationId: string, requestId: string, amount?: Money) {
  checkId(authorizationId, "Authorization");
  checkRequestId(requestId);
  if (amount) {
    checkAmount(amount.value);
    checkCurrency(amount.currency);
  }
  const body = amount ? { final_capture: true, amount: { value: amount.value, currency_code: amount.currency } } : { final_capture: true };
  const capture = await call<{ id: string; status: string }>(`/v2/payments/authorizations/${authorizationId}/capture`, requestId, body);
  return { captureId: capture!.id, status: capture!.status };
}

export async function voidAuthorization(authorizationId: string, requestId: string) {
  checkId(authorizationId, "Authorization");
  checkRequestId(requestId);
  await call(`/v2/payments/authorizations/${authorizationId}/void`, requestId);
  return { authorizationId, status: "VOIDED" as const };
}
