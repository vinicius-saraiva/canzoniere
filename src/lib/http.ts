/** Polite fetch: browser-like headers, one request at a time per host, short delay between them. */

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const MIN_GAP_MS = 350;
const lastByHost = new Map<string, Promise<void>>();

async function throttle(host: string): Promise<void> {
  const prev = lastByHost.get(host) ?? Promise.resolve();
  const next = prev.then(() => new Promise<void>((r) => setTimeout(r, MIN_GAP_MS)));
  lastByHost.set(host, next.catch(() => undefined));
  await prev;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
  }
}

export async function fetchText(url: string, init: RequestInit = {}): Promise<string> {
  const host = new URL(url).host;
  await throttle(host);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "it-IT,it;q=0.9,en;q=0.8,pt-BR;q=0.7",
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) throw new HttpError(res.status, url);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const text = await fetchText(url, init);
  return JSON.parse(text) as T;
}
