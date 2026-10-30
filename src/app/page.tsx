import { getCatalog } from "@/lib/github";
import { CATEGORY_LIST } from "@/lib/categories";
import { ContentGallery } from "@/components/ContentGallery";

export default async function Home() {
  const catalog = await getCatalog();
  const { mod, sections } = catalog;
  const sources = CATEGORY_LIST.map(({ id, label }) => {
    const section = sections[id];
    return `${label} from ${section.status === "ok" ? section.source : "(failed to load)"}`;
  });

  return (
    <main id="main" className="mx-auto max-w-6xl px-4 py-16 sm:px-8 sm:py-24">
      <header className="mb-16 max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted">
          Balatro mod{mod.version && ` · v${mod.version}`}
          {mod.authors.length > 0 && ` · by ${mod.authors.join(", ")}`}
        </p>
        <h1 className="mt-4 text-5xl font-light tracking-tight sm:text-7xl">{mod.name}</h1>
        {mod.description && <p className="mt-6 text-lg leading-relaxed text-muted">{mod.description}</p>}
      </header>

      <ContentGallery sections={sections} />

      <section aria-labelledby="sync-heading" className="mt-24 border-t border-foreground pt-8 text-sm">
        <h2 id="sync-heading" className="font-mono text-xs uppercase tracking-[0.2em]">
          Sync
        </h2>
        <p className="mt-3 text-muted">
          Loaded from{" "}
          <a href={catalog.repoUrl} className="underline underline-offset-4 hover:no-underline">
            {catalog.repo}
          </a>{" "}
          @ {catalog.branch}: {sources.join(", ")}. Refreshed at most every hour.
        </p>
        {catalog.warnings.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer font-mono text-xs uppercase tracking-[0.15em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground">
              {catalog.warnings.length} sync note{catalog.warnings.length === 1 ? "" : "s"}
            </summary>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-muted">
              {catalog.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </main>
  );
}
