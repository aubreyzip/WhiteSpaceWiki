import { CATEGORIES } from "@/lib/categories";
import type { ContentItem } from "@/types/content";
import { CardArt } from "@/components/CardArt";
import { CardDescription } from "@/components/CardDescription";
import { CardMeta } from "@/components/CardMeta";

export function ContentCard({ item }: { item: ContentItem }) {
  return (
    <article className="flex h-full flex-col border border-foreground bg-background p-3 transition duration-200 hover:shadow-[6px_6px_0_0_var(--foreground)] motion-safe:hover:-translate-y-1 sm:p-5">
      <div className="flex justify-center bg-subtle py-3 sm:py-6">
        <CardArt
          sprite={item.sprite}
          name={item.name}
          fallbackCell={CATEGORIES[item.category].fallbackArt}
          className="w-full max-w-35.5 max-[379px]:[image-rendering:auto]"
        />
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-2 sm:mt-5 sm:gap-3">
        <h3 className="min-w-0 text-sm font-semibold tracking-tight wrap-anywhere sm:text-lg">{item.name}</h3>
        {item.cost !== null && (
          <span className="shrink-0 font-mono text-xs sm:text-sm" aria-label={`Costs ${item.cost} dollars`}>
            ${item.cost}
          </span>
        )}
      </div>

      <p className="mt-1 font-mono text-[0.625rem] uppercase tracking-[0.15em] text-muted sm:text-xs sm:tracking-[0.2em]">
        <CardMeta item={item} />
        {item.placeholderArt && <span> · placeholder art</span>}
      </p>

      <CardDescription text={item.text} vars={item.vars} className="mt-2 text-xs leading-relaxed sm:mt-4 sm:text-sm" />

      {item.vars.some((v) => v?.dynamic) && (
        <p className="mt-auto pt-3 text-[0.6875rem] text-muted sm:pt-4 sm:text-xs">Dotted values are starting values and change during a run.</p>
      )}
    </article>
  );
}
