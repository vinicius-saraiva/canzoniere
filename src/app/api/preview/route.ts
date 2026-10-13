import { NextResponse } from "next/server";
import { z } from "zod";
import { renderHtml } from "@/lib/sheet";

const Body = z.object({ chordpro: z.string(), transpose: z.number().int().min(-11).max(11).default(0) });

/** Render one sheet to HTML for the in-browser review step. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    return NextResponse.json({ html: renderHtml(parsed.data.chordpro, parsed.data.transpose) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
