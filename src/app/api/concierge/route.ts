import { NextResponse } from "next/server";
import { runConcierge, validateInput, type ConciergeInput } from "@/lib/concierge/agent";
import { clientKey, createLimiter } from "@/lib/concierge/rate-limit";
import { conciergeModel, paypalTools } from "@/lib/concierge/runtime";
import { HttpError, readJson } from "@/lib/paypal/http";

const limiter = createLimiter({ limit: 20, windowMs: 60_000 });

/** POST /api/concierge  { message, mode: "you" | "them", where?, history? } */
export async function POST(req: Request) {
  try {
    if (!limiter.take(clientKey(req))) throw new HttpError(429, "Too many requests. Try again in a minute.");
    const body = await readJson(req);
    const input: ConciergeInput = {
      message: body.message as string,
      mode: (body.mode ?? "you") as ConciergeInput["mode"],
      where: body.where as string | undefined,
      history: body.history as ConciergeInput["history"],
    };
    try {
      validateInput(input);
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
    let model;
    try {
      model = conciergeModel();
    } catch (err) {
      throw new HttpError(503, (err as Error).message);
    }
    return NextResponse.json(await runConcierge(input, { model, extraTools: paypalTools() }));
  } catch (err) {
    if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Concierge error:", err);
    return NextResponse.json({ error: "The concierge is having trouble right now. Try again in a moment." }, { status: 502 });
  }
}
