import Link from "next/link";
import { ExternalLink } from "lucide-react";

const REPO_URL = `https://github.com/${process.env.GITHUB_REPO || "aubreyzip/WhiteSpace"}`;

const navLink =
  "inline-flex items-center gap-1.5 px-2 py-1 font-mono text-xs uppercase tracking-[0.2em] hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

export function SiteHeader() {
  return (
    <header className="border-b border-foreground">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-8">
        <Link
          href="/"
          className="font-mono text-sm font-semibold uppercase tracking-[0.3em] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
        >
          Aubrey&apos;s White Space
        </Link>
        <nav aria-label="Main">
          <ul className="flex items-center gap-2">
            <li>
              <Link href="/" className={navLink}>
                Jokers
              </Link>
            </li>
            <li>
              <a href={REPO_URL} target="_blank" rel="noreferrer" className={navLink}>
                GitHub
                <ExternalLink aria-hidden="true" className="size-3.5" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
