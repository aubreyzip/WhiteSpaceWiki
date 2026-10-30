"use client";

import { CATEGORY_LIST, type CategoryId } from "@/lib/categories";

export function CategoryNav({ category, onCategory }: { category: CategoryId; onCategory: (category: CategoryId) => void }) {
  return (
    <div role="group" aria-label="Content category" className="flex flex-wrap gap-2">
      {CATEGORY_LIST.map(({ id, label }) => {
        const active = category === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => onCategory(id)}
            className={`inline-flex h-11 items-center border border-foreground px-4 font-mono text-xs uppercase tracking-[0.15em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground motion-safe:transition-colors sm:h-9 ${active ? "bg-foreground text-background" : "hover:bg-subtle"}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
