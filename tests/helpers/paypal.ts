import { expect, vi } from "vitest";

/** Canned PayPal API responses. */
export const pp = {
  token: (overrides: Record<string, unknown> = {}) => ({ access_token: "A21-token", token_type: "Bearer", expires_in: 32400, ...overrides }),
  order: (overrides: Record<string, unknown> = {}) => ({ id: "5O190127TN364715T", status: "CREATED", ...overrides }),
  authorizedOrder: (authOverrides: Record<string, unknown> = {}) => ({
    id: "5O190127TN364715T",
    status: "COMPLETED",
    purchase_units: [{ payments: { authorizations: [{ id: "0AW2184448108334S", status: "CREATED", expiration_time: "2026-12-12T21:20:49Z", ...authOverrides }] } }],
  }),
  capture: (overrides: Record<string, unknown> = {}) => ({ id: "7TK53561YB803214S", status: "COMPLETED", ...overrides }),
  error: (name: string, message: string, debug_id = "dbg123") => ({ name, message, debug_id }),
};

export type MockResponse = { status: number; body?: unknown };

/** Stubs global fetch with a queue of responses, returned in order. */
export function mockPayPal(...responses: MockResponse[]) {
  const fetchMock = vi.fn(async () => {
    const r = responses.shift();
    if (!r) throw new Error("Unexpected extra fetch call");
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function setPayPalEnv(overrides: Record<string, string | undefined> = {}) {
  const env = { PAYPAL_CLIENT_ID: "client-id", PAYPAL_CLIENT_SECRET: "client-secret", PAYPAL_ENV: "sandbox", ...overrides };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) vi.stubEnv(k, ""); else vi.stubEnv(k, v);
  }
}

/** Checks the nth fetch call: method, URL, auth header, idempotency key and JSON body. */
export function verifyPayPalCall(
  fetchMock: ReturnType<typeof vi.fn>,
  n: number,
  expected: { method: string; url: string; auth?: "basic" | "bearer"; requestId?: string; body?: unknown },
) {
  const [url, init] = fetchMock.mock.calls[n] as [string, RequestInit];
  const headers = new Headers(init.headers);
  expect(init.method).toBe(expected.method);
  expect(url).toBe(expected.url);
  if (expected.auth === "basic") expect(headers.get("authorization")).toBe(`Basic ${btoa("client-id:client-secret")}`);
  if (expected.auth === "bearer") expect(headers.get("authorization")).toBe("Bearer A21-token");
  if (expected.requestId !== undefined) expect(headers.get("paypal-request-id")).toBe(expected.requestId);
  if (expected.body !== undefined) expect(JSON.parse(init.body as string)).toEqual(expected.body);
}
