import { NextResponse } from "next/server";
import { loadCategory } from "@/lib/passport/load";
import { categoryInfo } from "@/lib/passport/passport";
import { toResponse } from "@/lib/paypal/http";
import { visitorId } from "@/lib/visitor";

/** GET /api/passport/:category  Every quest in a category, with this visitor's progress. */
export async function GET(req: Request, { params }: { params: Promise<{ category: string }> }) {
  try {
    const userId = visitorId(req);
    const { category } = await params;
    if (!categoryInfo(category)) return NextResponse.json({ error: "Category not found" }, { status: 404 });
    return NextResponse.json(await loadCategory(userId, category));
  } catch (err) {
    return toResponse(err);
  }
}
