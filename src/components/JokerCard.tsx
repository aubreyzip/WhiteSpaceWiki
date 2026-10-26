import type { Joker } from "@/types/joker";
import { JokerArt } from "@/components/JokerArt";
import { JokerDescription } from "@/components/JokerDescription";

export function JokerCard({ joker }: { joker: Joker }) {
  return (
    <article className="flex h-full flex-col border border-foreground bg-background p-3 transition duration-200 hover:shadow-[6px_6px_0_0_var(--foreground)] motion-safe:hover:-translate-y-1 sm:p-5">
      <div className="flex justify-center bg-subtle py-3 sm:py-6">
        <JokerArt
          sprite={joker.sprite}
          name={joker.name}
          className="w-full max-w-35.5 max-[379px]:[image-rendering:auto]"
        />
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2 sm:mt-5 sm:gap-3">
        <h3 className="min-w-0 text-sm font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-lg">{joker.name}</h3>
        {joker.cost !== null && (
          <span className="shrink-0 font-mono text-xs sm:text-sm" aria-label={`Costs ${joker.cost} dollars`}>
            ${joker.cost}
          </span>
        )}
      </div>

      <p className="mt-1 font-mono text-[0.625rem] uppercase tracking-[0.15em] text-muted sm:text-xs sm:tracking-[0.2em]">
        {joker.rarityLabel}
        {joker.placeholderArt && <span> · placeholder art</span>}
      </p>

      <JokerDescription text={joker.text} vars={joker.vars} className="mt-2 text-xs leading-relaxed sm:mt-4 sm:text-sm" />

      {joker.vars.some((v) => v?.dynamic) && (
        <p className="mt-auto pt-3 text-[0.6875rem] text-muted sm:pt-4 sm:text-xs">Dotted values are starting values and change during a run.</p>
      )}
    </article>
  );
}
