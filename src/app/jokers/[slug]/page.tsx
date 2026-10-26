import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { getJokerBySlug, getJokerCatalog } from "@/lib/github";
import { JokerArt } from "@/components/JokerArt";
import { JokerDescription } from "@/components/JokerDescription";

export async function generateStaticParams() {
  const { jokers } = await getJokerCatalog();
  // Cache Components requires at least one param; the placeholder resolves to a 404.
  return jokers.length ? jokers.map((j) => ({ slug: j.slug })) : [{ slug: "__none__" }];
}

export async function generateMetadata({ params }: PageProps<"/jokers/[slug]">): Promise<Metadata> {
  const joker = await getJokerBySlug((await params).slug);
  if (!joker) return { title: "Joker not found" };
  return {
    title: joker.name,
    description: `${joker.name}, a ${joker.rarityLabel.toLowerCase()} Joker from Aubrey's White Space.`,
  };
}

export default function JokerPage({ params }: PageProps<"/jokers/[slug]">) {
  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-12 sm:px-8 sm:py-16">
      <Link
        href="/"
        className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        All Jokers
      </Link>
      <Suspense fallback={<DetailSkeleton />}>
        <JokerDetails params={params} />
      </Suspense>
    </main>
  );
}

async function JokerDetails({ params }: Pick<PageProps<"/jokers/[slug]">, "params">) {
  const { slug } = await params;
  const { jokers } = await getJokerCatalog();
  const index = jokers.findIndex((j) => j.slug === slug);
  if (index === -1) notFound();

  const joker = jokers[index];
  const prev = jokers[index - 1];
  const next = jokers[index + 1];

  const facts: [string, ReactNode][] = [
    ["Rarity", joker.rarityLabel],
    ["Cost", joker.cost !== null ? `$${joker.cost}` : "Unknown"],
    ["Key", <code key="key">{joker.fullKey}</code>],
  ];

  return (
    <article className="mt-10 grid gap-12 md:grid-cols-[auto_1fr] md:gap-16">
      <div className="flex justify-center self-start border border-foreground bg-subtle p-10 sm:p-14">
        <JokerArt sprite={joker.sprite} name={joker.name} className="w-35.5 sm:w-71" />
      </div>

      <div>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted">{joker.rarityLabel} Joker</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight sm:text-6xl">{joker.name}</h1>

        <JokerDescription text={joker.text} vars={joker.vars} className="mt-8 text-lg leading-relaxed" />

        {(!joker.sprite || joker.placeholderArt) && (
          <p className="mt-6 border-l-2 border-foreground pl-4 text-sm text-muted">
            {joker.sprite ? "This Joker currently uses the mod's placeholder artwork." : "Artwork for this Joker could not be found in the repository."}
          </p>
        )}

        <dl className="mt-10 divide-y divide-foreground/20 border-y border-foreground text-sm">
          {facts.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[6rem_1fr] gap-4 py-3">
              <dt className="font-mono text-xs uppercase tracking-[0.2em] text-muted">{label}</dt>
              <dd className="break-all">{value}</dd>
            </div>
          ))}
        </dl>

        <nav aria-label="Other Jokers" className="mt-10 flex justify-between gap-4 font-mono text-xs uppercase tracking-[0.15em]">
          {prev ? (
            <Link href={`/jokers/${prev.slug}`} className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground">
              ← {prev.name}
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/jokers/${next.slug}`} className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-foreground">
              {next.name} →
            </Link>
          )}
        </nav>
      </div>
    </article>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" className="mt-10 grid gap-12 md:grid-cols-[auto_1fr] md:gap-16">
      <p className="sr-only" role="status">
        Loading Joker…
      </p>
      <div className="mx-auto aspect-71/95 w-55 animate-pulse bg-subtle sm:w-99" />
      <div className="space-y-4">
        <div className="h-4 w-32 animate-pulse bg-subtle" />
        <div className="h-14 w-2/3 animate-pulse bg-subtle" />
        <div className="h-24 animate-pulse bg-subtle" />
      </div>
    </div>
  );
}
