import { fetchText } from "../http";
import { decodeEntities, matchScore } from "../text";
import type { Adapter, Candidate, RawSheet } from "../types";

/**
 * Ultimate Guitar. Every page embeds its data as JSON in a `div.js-store[data-content]`
 * attribute. Search results and tab contents both come from there.
 * Tab content uses [ch]X[/ch] around chords and [tab]..[/tab] around chord+lyric pairs.
 */

type StoreSearch = {
  store: { page: { data: { results?: UgResult[] } } };
};
type UgResult = {
  id?: number;
  song_name: string;
  artist_name: string;
  type?: string;
  rating?: number;
  votes?: number;
  version?: number;
  tab_url: string;
};
type StoreTab = {
  store: {
    page: {
      data: {
        tab: UgResult & { tonality_name?: string };
        tab_view: { wiki_tab: { content: string }; meta?: { capo?: number; tonality?: string } };
      };
    };
  };
};

function readStore<T>(html: string): T {
  const m = html.match(/class="js-store"\s+data-content="([^"]+)"/);
  if (!m) throw new Error("Ultimate Guitar page has no js-store block");
  return JSON.parse(decodeEntities(m[1])) as T;
}

export function ugMarkupToPlain(content: string): string {
  return content
    .replace(/\r\n?/g, "\n")
    .replace(/\[\/?tab\]/g, "")
    .replace(/\[ch\]([^\[]+)\[\/ch\]/g, "$1")
    .replace(/\[\/?syllable[^\]]*\]/g, "");
}

export const ultimateguitar: Adapter = {
  id: "ultimateguitar",
  name: "Ultimate Guitar",

  async search(title, artist) {
    const q = encodeURIComponent(`${artist} ${title}`.trim());
    const html = await fetchText(`https://www.ultimate-guitar.com/search.php?search_type=title&value=${q}`);
    const store = readStore<StoreSearch>(html);
    const results = store.store.page.data.results ?? [];
    const out: Candidate[] = results
      .filter((r) => r.type === "Chords" && r.id && /tabs\.ultimate-guitar\.com\/tab\//.test(r.tab_url))
      .map((r) => ({
        source: "ultimateguitar" as const,
        url: r.tab_url,
        title: decodeEntities(r.song_name),
        artist: decodeEntities(r.artist_name),
        score: matchScore({ title, artist }, { title: decodeEntities(r.song_name), artist: decodeEntities(r.artist_name) }),
        rating: r.rating,
        votes: r.votes,
        version: r.version,
      }));
    // Same score: prefer the version with the most votes.
    return out.sort((a, b) => b.score - a.score || (b.votes ?? 0) - (a.votes ?? 0));
  },

  async fetch(url) {
    const html = await fetchText(url);
    const store = readStore<StoreTab>(html);
    const { tab, tab_view } = store.store.page.data;
    return {
      source: "ultimateguitar",
      url,
      title: decodeEntities(tab.song_name),
      artist: decodeEntities(tab.artist_name),
      text: ugMarkupToPlain(tab_view.wiki_tab.content).trim(),
      key: tab_view.meta?.tonality ?? tab.tonality_name ?? undefined,
      capo: tab_view.meta?.capo || undefined,
    } satisfies RawSheet;
  },
};
