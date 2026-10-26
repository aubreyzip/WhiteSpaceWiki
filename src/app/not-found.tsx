import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-8">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted">404</p>
      <h1 className="mt-4 text-3xl font-light tracking-tight">There is nothing here.</h1>
      <p className="mt-4 text-muted">This Joker doesn&apos;t exist, or it has wandered off.</p>
      <Link
        href="/"
        className="mt-8 inline-block border border-foreground px-5 py-2 font-mono text-xs uppercase tracking-[0.15em] hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        Back to all Jokers
      </Link>
    </main>
  );
}
