import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveTrack, sheetFromCandidate } from "@/lib/resolve";
import { searchAll } from "@/lib/adapters";
import type { Candidate } from "@/lib/types";

export const maxDuration = 60;

const TrackSchema = z.object({ id: z.string(), title: z.string(), artist: z.string(), album: z.string().optional() });
const CandidateSchema = z.object({
  source: z.enum(["accordiespartiti", "ultimateguitar", "cifraclub"]),
  url: z.string().url(),
  title: z.string(),
  artist: z.string(),
  score: z.number(),
  rating: z.number().optional(),
  votes: z.number().optional(),
  version: z.number().optional(),
});
const Body = z.object({ track: TrackSchema, candidate: CandidateSchema.optional() });

/** Resolve one track to a chord sheet, or fetch a specific candidate the user picked. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { track, candidate } = parsed.data;
  try {
    if (candidate) {
      const candidates: Candidate[] = await searchAll(track.title, track.artist).catch(() => []);
      return NextResponse.json(await sheetFromCandidate(track, candidate, candidates));
    }
    return NextResponse.json(await resolveTrack(track));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
