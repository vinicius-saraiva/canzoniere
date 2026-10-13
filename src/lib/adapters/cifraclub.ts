import * as cheerio from "cheerio";
import { fetchText } from "../http";
import { matchScore } from "../text";
import type { Adapter, Candidate, RawSheet } from "../types";

/**
 * Cifra Club (cifraclub.com.br), Brazil's chord site, strong on Portuguese and Spanish.
 * Search: the public Solr endpoint the site's own search box uses (works from servers).
 * Song page: a <pre> with chords wrapped in <b>. The page is behind Akamai, which blocks
 * many non-browser requests with 403; when that happens the adapter reports the candidate
 * but fetch fails and the pipeline falls through to the next source.
 */

type SolrResponse = {
  response?: { docs?: { t: string; m: string; a: string; d: string; u: string; s?: number }[] };
};

export const cifraclub: Adapter = {
  id: "cifraclub",
  name: "Cifra Club",

  async search(title, artist) {
    const q = encodeURIComponent(`${artist} ${title}`.trim());
    // The endpoint answers with JSONP-style parentheses around the JSON.
    const text = await fetchText(`https://solr.sscdn.co/cc/h2/?q=${q}&wt=json`, { headers: { Accept: "application/json" } });
    const res = JSON.parse(text.trim().replace(/^\(|\)$/g, "")) as SolrResponse;
    const docs = res.response?.docs ?? [];
    const out: Candidate[] = docs
      .filter((d) => d.t === "2" && d.d && d.u) // t=2 are songs
      .map((d) => ({
        source: "cifraclub" as const,
        url: `https://www.cifraclub.com.br/${d.d}/${d.u}/`,
        title: d.m,
        artist: d.a,
        score: matchScore({ title, artist }, { title: d.m, artist: d.a }),
      }));
    return out.sort((a, b) => b.score - a.score);
  },

  async fetch(url) {
    const html = await fetchText(url, {
      headers: {
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Upgrade-Insecure-Requests": "1",
      },
    });
    const $ = cheerio.load(html);
    const pre = $("pre").first();
    if (!pre.length) throw new Error("No chord block found on page");
    const text = pre.text().replace(/\r/g, "").replace(/ /g, " ").trim();
    const title = $("h1").first().text().trim();
    const artist = $("h2").first().text().trim();
    const key = $("#cifra_tom a, .cifra_tom a, [data-tom]").first().text().trim() || undefined;
    const capoText = $("#cifra_capo, .cifra_capo").first().text();
    const capoMatch = capoText.match(/(\d+)/);
    return {
      source: "cifraclub",
      url,
      title,
      artist,
      text,
      key,
      capo: capoMatch ? Number(capoMatch[1]) : undefined,
    } satisfies RawSheet;
  },
};
