import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { PayPalError } from "./client";

const CONFIG_ERRORS = ["PayPal credentials are not configured", "PAYPAL_ENV must be sandbox or live"];

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Only the venue-confirmation step (server/admin) may charge or cancel a hold. */
export function requireAdmin(req: Request): void {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) throw new HttpError(503, "Admin key is not configured");
  const given = req.headers.get("x-admin-key") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, "Admin key required");
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body === null || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Body must be a JSON object");
  }
}

export function toResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof PayPalError) {
    const status = err.status >= 500 ? 502 : err.status;
    return NextResponse.json({ error: err.message, issue: err.issue, debugId: err.debugId }, { status });
  }
  const message = err instanceof Error ? err.message : "Unexpected error";
  if (CONFIG_ERRORS.includes(message)) return NextResponse.json({ error: message }, { status: 503 });
  if (message.startsWith("Experience not found")) return NextResponse.json({ error: message }, { status: 404 });
  if (err instanceof Error && !(err instanceof TypeError)) return NextResponse.json({ error: message }, { status: 400 });
  console.error("Unhandled PayPal route error:", err);
  return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
}
