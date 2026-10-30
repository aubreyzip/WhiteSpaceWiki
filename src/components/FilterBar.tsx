"use client";

import { CATEGORY_LIST, type CategoryId } from "@/lib/categories";
import type { SortOrder } from "@/lib/gallery";

const chip =
  "border border-foreground px-3 py-1.5 font-mono text-xs uppercase tracking-[0.15em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

export function FilterBar({
  category,
  onCategory,
  sort,
  onSort,
}: {
  category: CategoryId;
  onCategory: (category: CategoryId) => void;
  sort: SortOrder;
  onSort: (sort: SortOrder) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div role="group" aria-label="Content category" className="flex flex-wrap gap-2">
        {CATEGORY_LIST.map(({ id, label }) => {
          const active = category === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => onCategory(id)}
              className={`${chip} ${active ? "bg-foreground text-background" : "hover:bg-subtle"}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em]">
        Sort
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value === "za" ? "za" : "az")}
          className="border border-foreground bg-background px-2 py-1.5 font-mono text-xs uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          <option value="az">Name A–Z</option>
          <option value="za">Name Z–A</option>
        </select>
      </label>
    </div>
  );
}
