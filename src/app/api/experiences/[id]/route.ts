import { NextResponse } from "next/server";
import { getExperience } from "@/lib/catalog/catalog";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = getExperience(id);
  if (!e) return NextResponse.json({ error: `Experience not found: ${id}` }, { status: 404 });
  return NextResponse.json(e);
}
