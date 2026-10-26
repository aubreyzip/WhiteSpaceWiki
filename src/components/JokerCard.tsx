import Link from "next/link";
import type { Joker } from "@/types/joker";
import { JokerArt } from "@/components/JokerArt";
import { JokerDescription } from "@/components/JokerDescription";

export function JokerCard({ joker }: { joker: Joker }) {
  return (
    <Link
      href={`/jokers/${joker.slug}`}
      className="group flex h-full flex-col border border-foreground bg-background p-5 transition duration-200 hover:shadow-[6px_6px_0_0_var(--foreground)] focus-visible:shadow-[6px_6px_0_0_var(--foreground)] focus-visible:outline-none motion-safe:hover:-translate-y-1 motion-safe:focus-visible:-translate-y-1"
    >
      <div className="flex justify-center bg-subtle py-6">
        <JokerArt
          sprite={joker.sprite}
          name={joker.name}
          className="w-35.5"
        />
      </div>

      <div className="mt-5 flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold tracking-tight">{joker.name}</h3>
        {joker.cost !== null && (
          <span className="font-mono text-sm" aria-label={`Costs ${joker.cost} dollars`}>
            ${joker.cost}
          </span>
        )}
      </div>

      <p className="mt-1 font-mono text-xs uppercase tracking-[0.2em] text-muted">
        {joker.rarityLabel}
        {joker.placeholderArt && <span> · placeholder art</span>}
      </p>

      <JokerDescription text={joker.text} vars={joker.vars} className="mt-4 text-sm leading-relaxed" />
    </Link>
  );
}
