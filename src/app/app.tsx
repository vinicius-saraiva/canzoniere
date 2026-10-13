"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Candidate, Sheet, Track } from "@/lib/types";

type Playlist = { id: string; name: string; tracks: number; image?: string };
type Session = { youtube?: boolean; configured: boolean; loggedIn: boolean; playlists: Playlist[] };

const SOURCE_NAMES: Record<string, string> = {
  accordiespartiti: "Accordi e Spartiti",
  ultimateguitar: "Ultimate Guitar",
  cifraclub: "Cifra Club",
};

const STORAGE_KEY = "canzoniere:state";
const NOTATION_KEY = "canzoniere:notation";

type Notation = "italian" | "english";

function readNotation(): Notation {
  try {
    return localStorage.getItem(NOTATION_KEY) === "english" ? "english" : "italian";
  } catch {
    return "italian";
  }
}

type State = { name: string; tracks: Track[]; sheets: Record<string, Sheet> };

function readStoredState(): State | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as State) : null;
  } catch {
    return null;
  }
}

export function App() {
  const params = useSearchParams();
  const [session, setSession] = useState<Session | null>(null);
  // This component is loaded with ssr: false, so browser storage is safe to read during init.
  const [state, setState] = useState<State | null>(readStoredState);
  const spotifyParam = params.get("spotify");
  const [error, setError] = useState<string | null>(
    spotifyParam?.startsWith("error:") ? `Spotify login failed: ${spotifyParam.slice(6)}` : null,
  );

  useEffect(() => {
    fetch("/api/spotify/playlists")
      .then((r) => r.json())
      .then(setSession)
      .catch(() => setSession({ youtube: false, configured: false, loggedIn: false, playlists: [] }));
  }, []);

  useEffect(() => {
    try {
      if (state) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, [state]);

  const start = useCallback(async (body: { playlist: string } | { list: string }) => {
    setError(null);
    const res = await fetch("/api/tracks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      if (json.error === "login") {
        window.location.assign(new URL("/api/spotify/login", window.location.origin).href);
        return;
      }
      setError(json.error ?? "Something went wrong");
      return;
    }
    setState({ name: json.name, tracks: json.tracks, sheets: {} });
  }, []);

  if (!state) {
    return (
      <>
        {error && <Alert>{error}</Alert>}
        <InputStep session={session} onStart={start} />
      </>
    );
  }
  return (
    <ReviewStep
      state={state}
      setState={setState}
      onReset={() => {
        setState(null);
        setError(null);
      }}
    />
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{children}</div>;
}

/* ---------------- Step 1: input ---------------- */

function InputStep({
  session,
  onStart,
}: {
  session: Session | null;
  onStart: (b: { playlist: string } | { list: string }) => Promise<void>;
}) {
  const [playlist, setPlaylist] = useState("");
  const [youtube, setYoutube] = useState("");
  const [list, setList] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (body: { playlist: string } | { list: string }) => {
    setBusy(true);
    try {
      await onStart(body);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <section className="rounded-lg border border-stone-200 bg-white p-5">
        <h2 className="text-lg font-medium">From a YouTube playlist</h2>
        <p className="mt-1 text-sm text-stone-600">
          Any public or unlisted playlist, no login needed. Make one together, then paste its link here.
        </p>
        {session && session.youtube === false ? (
          <p className="mt-3 text-sm text-amber-700">
            YouTube is not set up on this server (missing <code>YOUTUBE_API_KEY</code>).
          </p>
        ) : (
          <>
            <label className="mt-3 block text-sm">
              <span className="text-stone-600">Playlist link</span>
              <input
                value={youtube}
                onChange={(e) => setYoutube(e.target.value)}
                placeholder="https://www.youtube.com/playlist?list=…"
                className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-sm"
              />
            </label>
            <button
              type="button"
              disabled={busy || !youtube.trim()}
              onClick={() => run({ playlist: youtube })}
              className="mt-3 rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Loading…" : "Load playlist"}
            </button>
          </>
        )}
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-5">
        <h2 className="text-lg font-medium">From a Spotify playlist</h2>
        {session && !session.configured && (
          <p className="mt-2 text-sm text-stone-600">
            Spotify is not configured on this server yet. Set <code>SPOTIFY_CLIENT_ID</code> and{" "}
            <code>SPOTIFY_REDIRECT_URI</code>, or use the list on the right.
          </p>
        )}
        {session?.configured && !session.loggedIn && (
          <div className="mt-3">
            <p className="text-sm text-stone-600">
              Spotify only lets this app read playlists you own or collaborate on, so you need to log in first.
            </p>
            <a
              href="/api/spotify/login"
              className="mt-3 inline-block rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Log in with Spotify
            </a>
          </div>
        )}
        {session?.loggedIn && (
          <div className="mt-3 space-y-3">
            <label className="block text-sm">
              <span className="text-stone-600">Playlist link, URI or ID</span>
              <input
                value={playlist}
                onChange={(e) => setPlaylist(e.target.value)}
                placeholder="https://open.spotify.com/playlist/…"
                className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-sm"
              />
            </label>
            {session.playlists.length > 0 && (
              <div>
                <p className="text-sm text-stone-600">Or pick one of yours:</p>
                <ul className="mt-1 max-h-56 divide-y divide-stone-100 overflow-auto rounded-md border border-stone-200">
                  {session.playlists.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run({ playlist: p.id })}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-stone-50"
                      >
                        <span>{p.name}</span>
                        <span className="text-xs text-stone-500">{p.tracks} songs</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={busy || !playlist.trim()}
                onClick={() => run({ playlist })}
                className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {busy ? "Loading…" : "Load playlist"}
              </button>
              <button
                type="button"
                className="text-sm text-stone-500 underline"
                onClick={async () => {
                  await fetch("/api/spotify/logout", { method: "POST" });
                  window.location.reload();
                }}
              >
                Log out
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-5">
        <h2 className="text-lg font-medium">Or paste a list of songs</h2>
        <p className="mt-1 text-sm text-stone-600">One per line, as “Artist - Title”.</p>
        <textarea
          value={list}
          onChange={(e) => setList(e.target.value)}
          rows={10}
          placeholder={"Lucio Dalla - Caruso\nOasis - Wonderwall\nLegião Urbana - Tempo Perdido"}
          className="mt-3 w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-sm"
        />
        <button
          type="button"
          disabled={busy || !list.trim()}
          onClick={() => run({ list })}
          className="mt-3 rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Loading…" : "Find chords"}
        </button>
      </section>
    </div>
  );
}

/* ---------------- Step 2: review ---------------- */

function ReviewStep({
  state,
  setState,
  onReset,
}: {
  state: State;
  setState: React.Dispatch<React.SetStateAction<State | null>>;
  onReset: () => void;
}) {
  const [title, setTitle] = useState(state.name);
  const [fontSize, setFontSize] = useState(11);
  const [sortAlpha, setSortAlpha] = useState(true);
  const [notation, setNotation] = useState<Notation>(readNotation);
  const [columns, setColumns] = useState<1 | 2>(2);
  const changeNotation = (n: Notation) => {
    setNotation(n);
    try {
      localStorage.setItem(NOTATION_KEY, n);
    } catch {}
  };
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const pending = state.tracks.filter((t) => !state.sheets[t.id]);
  const done = state.tracks.length - pending.length;

  const updateSheet = useCallback(
    (trackId: string, patch: Partial<Sheet> | ((s: Sheet) => Sheet)) => {
      setState((s) => {
        if (!s) return s;
        const cur = s.sheets[trackId];
        if (!cur) return s;
        const next = typeof patch === "function" ? patch(cur) : { ...cur, ...patch };
        return { ...s, sheets: { ...s.sheets, [trackId]: next } };
      });
    },
    [setState],
  );

  // Resolve tracks a few at a time; the server throttles per site anyway.
  useEffect(() => {
    if (running.current || pending.length === 0) return;
    running.current = true;
    const batch = pending.slice(0, 3);
    Promise.all(
      batch.map(async (track) => {
        let sheet: Sheet;
        try {
          const res = await fetch("/api/resolve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ track }),
          });
          sheet = res.ok ? await res.json() : missing(track);
        } catch {
          sheet = missing(track);
        }
        setState((s) => (s ? { ...s, sheets: { ...s.sheets, [track.id]: sheet } } : s));
      }),
    ).finally(() => {
      running.current = false;
    });
  }, [pending, setState]);

  const stats = useMemo(() => {
    const sheets = Object.values(state.sheets);
    return {
      ok: sheets.filter((s) => s.status === "ok" || s.status === "manual").length,
      doubtful: sheets.filter((s) => s.confidence === "doubtful").length,
      lyrics: sheets.filter((s) => s.status === "lyrics-only").length,
      missing: sheets.filter((s) => s.status === "missing").length,
    };
  }, [state.sheets]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const songs = state.tracks
        .map((t) => state.sheets[t.id])
        .filter((s): s is Sheet => Boolean(s) && s.status !== "missing" && s.chordpro.trim().length > 0)
        .map((s) => ({
          title: s.title,
          artist: s.artist,
          chordpro: s.chordpro,
          transpose: s.transpose,
          capo: s.capo,
          status: s.status as "ok" | "lyrics-only" | "manual",
        }));
      const res = await fetch("/api/songbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, fontSize, sortAlphabetically: sortAlpha, notation, columns, songs }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^\w\- ]+/g, "").trim() || "songbook"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-stone-200 bg-white p-5">
        <label className="flex-1 text-sm">
          <span className="text-stone-600">Songbook title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="text-stone-600">Font size</span>
          <select
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="mt-1 block rounded-md border border-stone-300 px-3 py-2"
          >
            {[9, 10, 11, 12, 13, 14].map((n) => (
              <option key={n} value={n}>
                {n}px
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-stone-600">Chord names</span>
          <select
            value={notation}
            onChange={(e) => changeNotation(e.target.value as Notation)}
            className="mt-1 block rounded-md border border-stone-300 px-3 py-2"
          >
            <option value="italian">Do Re Mi (Italian)</option>
            <option value="english">C D E (English)</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="text-stone-600">Layout</span>
          <select
            value={columns}
            onChange={(e) => setColumns(Number(e.target.value) === 1 ? 1 : 2)}
            className="mt-1 block rounded-md border border-stone-300 px-3 py-2"
          >
            <option value={2}>Two columns</option>
            <option value={1}>One column</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={sortAlpha} onChange={(e) => setSortAlpha(e.target.checked)} />
          Sort A–Z
        </label>
        <button
          type="button"
          disabled={generating || pending.length > 0 || stats.ok + stats.lyrics === 0}
          onClick={generate}
          className="rounded-md bg-stone-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {generating ? "Building PDF…" : pending.length > 0 ? `Finding chords… ${done}/${state.tracks.length}` : "Download PDF"}
        </button>
        <button type="button" onClick={onReset} className="pb-2 text-sm text-stone-500 underline">
          Start over
        </button>
      </div>

      {error && <Alert>{error}</Alert>}

      <p className="text-sm text-stone-600">
        {stats.ok} with chords · {stats.doubtful} to check · {stats.lyrics} lyrics only · {stats.missing} not found ·{" "}
        {pending.length} pending
      </p>

      <ul className="space-y-3">
        {state.tracks.map((t) => (
          <SongRow
            key={t.id}
            track={t}
            sheet={state.sheets[t.id]}
            notation={notation}
            onChange={(p) => updateSheet(t.id, p)}
          />
        ))}
      </ul>
    </div>
  );
}

function missing(track: Track): Sheet {
  return {
    trackId: track.id,
    title: track.title,
    artist: track.artist,
    status: "missing",
    chordpro: "",
    confidence: "none",
    candidates: [],
    transpose: 0,
  };
}

/* ---------------- One song ---------------- */

function SongRow({
  track,
  sheet,
  notation,
  onChange,
}: {
  track: Track;
  sheet?: Sheet;
  notation: Notation;
  onChange: (patch: Partial<Sheet> | ((s: Sheet) => Sheet)) => void;
}) {
  const [open, setOpen] = useState(false);
  // Preview HTML is keyed by the sheet content it was rendered from, so a stale preview never shows.
  const previewKey = sheet ? `${notation}|${sheet.transpose}|${sheet.chordpro}` : "";
  const [preview, setPreview] = useState<{ key: string; html: string } | null>(null);
  const html = preview && preview.key === previewKey ? preview.html : null;
  const [manual, setManual] = useState("");
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!open || !sheet || !sheet.chordpro) return;
    let cancelled = false;
    const key = previewKey;
    fetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chordpro: sheet.chordpro, transpose: sheet.transpose, notation }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.html) setPreview({ key, html: j.html });
      });
    return () => {
      cancelled = true;
    };
  }, [open, sheet, previewKey, notation]);

  const pick = async (cand: Candidate) => {
    setSwitching(true);
    try {
      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ track, candidate: cand }),
      });
      if (res.ok) {
        const next = (await res.json()) as Sheet;
        onChange((s) => ({ ...next, candidates: s.candidates.length ? s.candidates : next.candidates, transpose: 0 }));
      }
    } finally {
      setSwitching(false);
    }
  };

  const applyManual = () => {
    if (!manual.trim()) return;
    const chordpro = `{title: ${track.title}}\n{artist: ${track.artist}}\n\n${manual.trim()}\n`;
    onChange({ status: "manual", chordpro, confidence: "good", source: undefined, url: undefined, transpose: 0 });
    setManual("");
  };

  const badge = !sheet
    ? { text: "searching…", cls: "bg-stone-100 text-stone-600" }
    : sheet.status === "missing"
      ? { text: "not found", cls: "bg-red-100 text-red-800" }
      : sheet.status === "lyrics-only"
        ? { text: "lyrics only", cls: "bg-amber-100 text-amber-800" }
        : sheet.status === "manual"
          ? { text: "your own", cls: "bg-blue-100 text-blue-800" }
          : sheet.confidence === "doubtful"
            ? { text: "check match", cls: "bg-amber-100 text-amber-800" }
            : { text: "chords", cls: "bg-green-100 text-green-800" };

  return (
    <li className="rounded-lg border border-stone-200 bg-white">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex-1 text-left">
          <span className="font-medium">{track.title}</span>
          <span className="text-stone-500"> · {track.artist}</span>
        </button>
        <span className={`rounded-full px-2 py-0.5 text-xs ${badge.cls}`}>{badge.text}</span>
        {sheet?.source && sheet.url && (
          <a href={sheet.url} target="_blank" rel="noreferrer" className="text-xs text-stone-500 underline">
            {SOURCE_NAMES[sheet.source]}
          </a>
        )}
        {sheet && sheet.status !== "missing" && sheet.status !== "lyrics-only" && (
          <span className="flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => onChange({ transpose: sheet.transpose - 1 })}
              className="rounded border border-stone-300 px-2 py-0.5"
              aria-label="Transpose down"
            >
              −
            </button>
            <span className="w-10 text-center font-mono">
              {sheet.transpose > 0 ? `+${sheet.transpose}` : sheet.transpose}
            </span>
            <button
              type="button"
              onClick={() => onChange({ transpose: sheet.transpose + 1 })}
              className="rounded border border-stone-300 px-2 py-0.5"
              aria-label="Transpose up"
            >
              +
            </button>
          </span>
        )}
      </div>

      {open && sheet && (
        <div className="border-t border-stone-100 px-4 py-3">
          {sheet.candidates.length > 0 && (
            <label className="block text-sm">
              <span className="text-stone-600">Version</span>
              <select
                disabled={switching}
                value={sheet.url ?? ""}
                onChange={(e) => {
                  const c = sheet.candidates.find((x) => x.url === e.target.value);
                  if (c) pick(c);
                }}
                className="mt-1 block w-full max-w-xl rounded-md border border-stone-300 px-3 py-2"
              >
                {!sheet.url && <option value="">— pick a version —</option>}
                {sheet.candidates.map((c) => (
                  <option key={c.url} value={c.url}>
                    {SOURCE_NAMES[c.source]} · {c.title} · {c.artist} · {Math.round(c.score * 100)}%
                    {c.votes ? ` · ${c.votes} votes` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          {html ? (
            <div className="mt-3 max-h-96 overflow-auto rounded-md border border-stone-200 bg-stone-50 p-3 text-sm">
              <style>{`
                .chord-sheet{font-family:var(--font-geist-mono),Menlo,monospace;line-height:1.3}
                .chord-sheet .paragraph{margin-bottom:.8em}
                .chord-sheet .row{display:flex;flex-wrap:wrap;align-items:flex-start}
                .chord-sheet .column{display:flex;flex-direction:column}
                .chord-sheet .chord,.chord-sheet .lyrics{white-space:pre;min-height:1.25em}
                .chord-sheet .chord{font-weight:700;color:#1a4fb3;padding-right:.35em}
                .chord-sheet .row:not(:has(.chord:not(:empty))) .chord{display:none}
                .chord-sheet .comment{font-style:italic;color:#666}
                .chord-sheet h2{font-size:.9em;margin:0}
              `}</style>
              <div dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          ) : sheet.chordpro ? (
            <p className="mt-3 text-sm text-stone-500">Loading preview…</p>
          ) : null}

          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-stone-600">Paste your own chord sheet instead</summary>
            <textarea
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              rows={8}
              placeholder={"Chords over words, or ChordPro with [C]brackets"}
              className="mt-2 w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-xs"
            />
            <button
              type="button"
              onClick={applyManual}
              className="mt-2 rounded-md border border-stone-300 px-3 py-1 text-sm"
            >
              Use this
            </button>
          </details>
        </div>
      )}
    </li>
  );
}
