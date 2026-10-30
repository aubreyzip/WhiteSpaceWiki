"use client";

import { useMemo, useState } from "react";
import { CATEGORIES, DEFAULT_CATEGORY, type CategoryId } from "@/lib/categories";
import { DEFAULT_SORT, effectiveSort, filterAndSort, sortOptionsFor, type SortOrder } from "@/lib/gallery";
import type { CatalogSections, ContentItem } from "@/types/content";
import { ContentCard } from "@/components/ContentCard";
import { SearchBar } from "@/components/SearchBar";
import { CategoryNav } from "@/components/CategoryNav";
import { SortSelect } from "@/components/SortSelect";

const NO_ITEMS: readonly ContentItem[] = [];

const emptyBox = "mt-4 border border-dashed border-foreground px-6 py-16 text-center";

export function ContentGallery({ sections }: { sections: CatalogSections }) {
  const [category, setCategory] = useState<CategoryId>(DEFAULT_CATEGORY);
  const [query, setQuery] = useState("");
  // The user's choice is kept across categories; `sort` falls back to the default where it isn't offered.
  const [requestedSort, setSort] = useState<SortOrder>(DEFAULT_SORT);
  const sort = effectiveSort(requestedSort, category);

  const { label } = CATEGORIES[category];
  const section = sections[category];
  const items = section.status === "ok" ? section.items : NO_ITEMS;
  const visible = useMemo(() => filterAndSort(items, query, sort), [items, query, sort]);

  return (
    <section aria-labelledby="gallery-heading">
      <h2 id="gallery-heading" className="sr-only">
        {label} gallery
      </h2>

      {/* Category picks what's shown; search and sort then act on it, so they share one row. */}
      <div className="space-y-4">
        <CategoryNav category={category} onCategory={setCategory} />
        <div role="search" aria-label={`Search and sort ${label}`} className="flex flex-col gap-3 sm:flex-row">
          <div className="min-w-0 flex-1">
            <SearchBar value={query} onChange={setQuery} label={label} disabled={items.length === 0} />
          </div>
          <SortSelect value={sort} options={sortOptionsFor(category)} onChange={setSort} disabled={items.length === 0} />
        </div>
      </div>

      <p aria-live="polite" className="mt-8 font-mono text-xs uppercase tracking-[0.2em] text-muted">
        {section.status === "ok" ? `${visible.length} of ${items.length} ${label}` : `${label} unavailable`}
      </p>

      {section.status === "error" ? (
        <div role="alert" className={emptyBox}>
          <p className="text-lg">{label} couldn&apos;t be loaded.</p>
          <p className="mt-2 text-sm text-muted">{section.message}</p>
          <p className="mt-2 text-sm text-muted">Please try again in a few minutes.</p>
        </div>
      ) : items.length === 0 ? (
        <div className={emptyBox}>
          <p className="text-lg">Nothing here but white space.</p>
          <p className="mt-2 text-sm text-muted">The mod doesn&apos;t add any {label} yet.</p>
        </div>
      ) : visible.length > 0 ? (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((item) => (
            <li key={item.fullKey}>
              <ContentCard item={item} />
            </li>
          ))}
        </ul>
      ) : (
        <div className={emptyBox}>
          <p className="text-lg">Nothing here but white space.</p>
          <p className="mt-2 text-sm text-muted">No {label} match your search.</p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="mt-6 border border-foreground px-4 py-2 font-mono text-xs uppercase tracking-[0.15em] hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            Clear search
          </button>
        </div>
      )}
    </section>
  );
}
