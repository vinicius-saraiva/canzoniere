import { ClientApp } from "./client";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Canzoniere</h1>
        <p className="mt-1 text-stone-600">
          Paste a Spotify playlist, get a PDF songbook with chords and lyrics for the whole group.
        </p>
      </header>
      <ClientApp />
    </main>
  );
}
