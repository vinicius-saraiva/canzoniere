import * as cheerio from "cheerio";

/** String normalization, fuzzy matching and chord-name helpers. */

const NOISE =
  /\s*[\(\[\-–].*?(remaster|remastered|live|version|edit|mix|feat\.?|ft\.?|bonus|mono|stereo|demo|acoustic|radio|single|album|deluxe|anniversary|\d{4}).*?([\)\]]|$)/gi;

export function stripNoise(s: string): string {
  return s.replace(NOISE, "").replace(/\s+/g, " ").trim();
}

export function normalize(s: string): string {
  return stripNoise(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = ` ${s} `;
  for (let i = 0; i < t.length - 1; i++) {
    const b = t.slice(i, i + 2);
    m.set(b, (m.get(b) ?? 0) + 1);
  }
  return m;
}

/** Sørensen–Dice similarity on character bigrams, 0..1. */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ba = bigrams(na);
  const bb = bigrams(nb);
  let inter = 0;
  let total = 0;
  for (const [k, v] of ba) {
    total += v;
    inter += Math.min(v, bb.get(k) ?? 0);
  }
  for (const v of bb.values()) total += v;
  return (2 * inter) / total;
}

/** Artists often come as "A, B" or "A feat. B"; match on the primary one too. */
export function artistSimilarity(wanted: string, found: string): number {
  const primary = wanted.split(/,|feat\.?|ft\.?|&|\bx\b|\/|;/i)[0] ?? wanted;
  return Math.max(similarity(wanted, found), similarity(primary, found));
}

export function matchScore(
  track: { title: string; artist: string },
  cand: { title: string; artist: string },
): number {
  const t = similarity(track.title, cand.title);
  const a = artistSimilarity(track.artist, cand.artist);
  return Math.round((0.6 * t + 0.4 * a) * 1000) / 1000;
}

const SOLFEGE: Record<string, string> = {
  DO: "C",
  RE: "D",
  MI: "E",
  FA: "F",
  SOL: "G",
  LA: "A",
  SI: "B",
};

/**
 * Convert Italian/Latin chord names (DO, RE, MI...) to letter names.
 * Handles the common Italian suffixes: 7+ (maj7), + (aug), - (minor), m, dim, sus.
 */
export function solfegeToLetters(text: string): string {
  const NOTE = "(DO|RE|MI|FA|SOL|LA|SI)";
  const re = new RegExp(
    `(^|[\\s(|])${NOTE}(#|b)?(m(?![a-z])|-)?(7\\+|\\+|dim|sus4|sus2|aug|maj7)?([0-9#b]*)(?:/${NOTE}(#|b)?)?(?:/([0-9]+))?`,
    "g",
  );
  return text
    .replace(
      re,
      (
        _m,
        pre: string,
        root: string,
        acc: string = "",
        minor: string = "",
        qual: string = "",
        rest: string = "",
        bassRoot?: string,
        bassAcc: string = "",
        slashNum?: string,
      ) => {
        let out = pre + SOLFEGE[root] + acc;
        if (minor) out += "m";
        if (qual === "7+") out += "maj7";
        else if (qual === "+") out += "aug";
        else if (qual) out += qual;
        out += rest;
        if (bassRoot) out += "/" + SOLFEGE[bassRoot] + bassAcc; // "RE/FA#" = D/F#
        if (slashNum) out += "/" + slashNum;
        return out;
      },
    )
    .replace(/\/4\b/g, "sus4") // Italian "LA7/4" = A7sus4
    .replace(/\/9\b/g, "add9") // "LAm7/9" = Am7add9
    .replace(/\/6\b/g, "6")
    .replace(/\/(11|13)\b/g, "add$1")
    .replace(/\b([A-G](?:#|b)?m?)4\b/g, "$1sus4"); // "RE4" = Dsus4
}

/** Decode HTML entities, numeric and named (&atilde; etc.). */
export function decodeEntities(s: string): string {
  if (!s.includes("&")) return s;
  return cheerio.load(`<p>${s}</p>`, undefined, false)("p").text();
}
