import { NextResponse } from "next/server";
import { z } from "zod";
import { htmlToPdf } from "@/lib/pdf";
import { songbookHtml } from "@/lib/songbook";

export const maxDuration = 120;

const Body = z.object({
  title: z.string().min(1).max(120),
  fontSize: z.number().int().min(8).max(16).default(11),
  sortAlphabetically: z.boolean().default(true),
  notation: z.enum(["italian", "english"]).default("italian"),
  songs: z
    .array(
      z.object({
        title: z.string(),
        artist: z.string(),
        chordpro: z.string(),
        transpose: z.number().int().min(-11).max(11).default(0),
        capo: z.number().int().nullish(),
        status: z.enum(["ok", "lyrics-only", "manual"]),
      }),
    )
    .min(1)
    .max(300),
});

/** Build the PDF songbook from the reviewed sheets. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  const { songs, ...opts } = parsed.data;
  try {
    const pdf = await htmlToPdf(songbookHtml(songs, opts));
    const filename = opts.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "songbook";
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
