"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-8">
      <TriangleAlert aria-hidden="true" className="mx-auto size-8" />
      <h1 className="mt-6 text-3xl font-light tracking-tight">Something is behind you.</h1>
      <p className="mt-4 text-muted">
        The Jokers couldn&apos;t be loaded from GitHub. The repository may be unreachable or rate limiting requests.
        Please try again in a moment.
      </p>
      <button
        type="button"
        onClick={retry}
        className="mt-8 border border-foreground px-5 py-2 font-mono text-xs uppercase tracking-[0.15em] hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        Try again
      </button>
    </main>
  );
}
