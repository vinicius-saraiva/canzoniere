import * as cheerio from "cheerio";
import { fetchJson, fetchText } from "../http";
import { matchScore, solfegeToLetters } from "../text";
import type { Adapter, Candidate, RawSheet } from "../types";

/**
 * Accordi e Spartiti (accordiespartiti.it), the main Italian chord site.
 * Search: an undocumented WordPress REST endpoint used by the site's own search box.
 * Song page: one <pre> block, chords-over-words, Italian chord names (DO RE MI...).
 */

type SearchResponse = {
  success: boolean;
  data?: { posts?: { ln: string; n: string; cats?: { n: string; ln: string }[] }[] };
};

export const accordiespartiti: Adapter = {
  id: "accordiespartiti",
  name: "Accordi e Spartiti",

  async search(title, artist) {
    const q = encodeURIComponent(`${title} ${artist}`.trim());
    const res = await fetchJson<SearchResponse>(`https://www.accordiespartiti.it/wp-json/acas/v1/search/?query=${q}`);
    const posts = res.data?.posts ?? [];
    const out: Candidate[] = posts
      .filter((p) => p.ln.includes("/accordi/"))
      .map((p) => {
        const candArtist = p.cats?.[0]?.n ?? "";
        return {
          source: "accordiespartiti" as const,
          url: p.ln,
          title: p.n,
          artist: candArtist,
          score: matchScore({ title, artist }, { title: p.n, artist: candArtist }),
        };
      });
    // The site's search is title-only; retry with just the title if the combined query found nothing.
    if (out.length === 0 && artist) {
      const res2 = await fetchJson<SearchResponse>(
        `https://www.accordiespartiti.it/wp-json/acas/v1/search/?query=${encodeURIComponent(title)}`,
      );
      for (const p of res2.data?.posts ?? []) {
        if (!p.ln.includes("/accordi/")) continue;
        const candArtist = p.cats?.[0]?.n ?? "";
        out.push({
          source: "accordiespartiti",
          url: p.ln,
          title: p.n,
          artist: candArtist,
          score: matchScore({ title, artist }, { title: p.n, artist: candArtist }),
        });
      }
    }
    return out.sort((a, b) => b.score - a.score);
  },

  async fetch(url) {
    const html = await fetchText(url);
    const $ = cheerio.load(html);
    const pre = $("pre").first();
    if (!pre.length) throw new Error("No chord block found on page");
    const keyIt = pre.find("div.chiave").attr("name") ?? undefined;
    const text = solfegeToLetters(pre.text().replace(/\r/g, "").replace(/ /g, " ")).trim();
    const title = $("h1#post-title").first().text().trim() || $("h1").first().text().trim();
    const artist =
      $('a[href*="/cat/accordi/"]')
        .filter((_i, el) => /\/cat\/accordi\/[^/]+\/[^/]+\/$/.test($(el).attr("href") ?? ""))
        .first()
        .text()
        .trim() || "";
    return {
      source: "accordiespartiti",
      url,
      title,
      artist,
      text,
      key: keyIt ? solfegeToLetters(keyIt) : undefined,
    } satisfies RawSheet;
  },
};
