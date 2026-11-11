import { NextResponse } from "next/server";
import { listContributions } from "@/lib/gifts/repo";
import { addContribution } from "@/lib/gifts/service";
import { giftView } from "@/lib/gifts/view";
import { readJson, toResponse } from "@/lib/paypal/http";
import { visitorId } from "@/lib/visitor";

/** After a contributor approves in PayPal: { orderId, name } → the updated gift. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const contributorId = visitorId(req);
    const { id } = await params;
    const b = await readJson(req);
    const { gift } = await addContribution({ giftId: id, orderId: typeof b.orderId === "string" ? b.orderId : "", name: b.name, contributorId });
    return NextResponse.json(giftView(gift, await listContributions(gift.id), contributorId), { status: 201 });
  } catch (err) {
    return toResponse(err);
  }
}
