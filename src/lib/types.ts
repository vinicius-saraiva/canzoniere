export type Track = {
  id: string;
  title: string;
  artist: string;
  album?: string;
};

export type SourceId = "accordiespartiti" | "ultimateguitar" | "cifraclub";

export type Candidate = {
  source: SourceId;
  url: string;
  title: string;
  artist: string;
  /** 0..1 match score against the requested track */
  score: number;
  rating?: number;
  votes?: number;
  version?: number;
};

export type RawSheet = {
  source: SourceId;
  url: string;
  title: string;
  artist: string;
  /** Text in chords-over-words layout, standard chord names, no site markup */
  text: string;
  key?: string;
  capo?: number;
};

export type SheetStatus = "ok" | "lyrics-only" | "missing" | "manual";

export type Sheet = {
  trackId: string;
  title: string;
  artist: string;
  status: SheetStatus;
  source?: SourceId;
  url?: string;
  chordpro: string;
  key?: string;
  capo?: number;
  /** "doubtful" when the best match score is below the confidence threshold */
  confidence: "good" | "doubtful" | "none";
  candidates: Candidate[];
  transpose: number;
};

export interface Adapter {
  id: SourceId;
  name: string;
  search(title: string, artist: string): Promise<Candidate[]>;
  fetch(url: string): Promise<RawSheet>;
}
