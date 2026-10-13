"use client";

import dynamic from "next/dynamic";

/** The app keeps its state in the browser tab, so it is only rendered on the client. */
export const ClientApp = dynamic(() => import("./app").then((m) => m.App), {
  ssr: false,
  loading: () => <p className="text-sm text-stone-500">Loading…</p>,
});
