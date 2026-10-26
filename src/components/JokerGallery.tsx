"use client";

import { useMemo, useState } from "react";
import type { Joker } from "@/types/joker";
import { JokerCard } from "@/components/JokerCard";
import { SearchBar } from "@/components/SearchBar";
import { FilterBar, type SortOrder } from "@/components/FilterBar";

const rarityOrder = (j: Joker) => (typeof j.rarity === "number" ? j.rarity : 99);

export function JokerGallery({ jokers }: { jokers: Joker[] }) {
  const [query, setQuery] = useState("");
  const [rarity, setRarity] = useState<string | null>(null);
  const [sort, setSort] = useState<SortOrder>("az");

  const rarities = useMemo(
    () => [...new Map([...jokers].sort((a, b) => rarityOrder(a) - rarityOrder(b)).map((j) => [j.rarityLabel, j])).keys()],
    [jokers],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jokers
      .filter((j) => (!q || j.name.toLowerCase().includes(q)) && (!rarity || j.rarityLabel === rarity))
      .sort((a, b) => (sort === "az" ? 1 : -1) * a.name.localeCompare(b.name));
  }, [jokers, query, rarity, sort]);

  const reset = () => {
    setQuery("");
    setRarity(null);
  };

  return (
    <section aria-labelledby="gallery-heading">
      <h2 id="gallery-heading" className="sr-only">
        Joker gallery
      </h2>

      <div className="space-y-5">
        <SearchBar value={query} onChange={setQuery} />
        <FilterBar rarities={rarities} selected={rarity} onSelect={setRarity} sort={sort} onSort={setSort} />
      </div>

      <p aria-live="polite" className="mt-8 font-mono text-xs uppercase tracking-[0.2em] text-muted">
        {visible.length} of {jokers.length} Jokers
      </p>

      {visible.length > 0 ? (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((joker) => (
            <li key={joker.key}>
              <JokerCard joker={joker} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 border border-dashed border-foreground px-6 py-16 text-center">
          <p className="text-lg">Nothing here but white space.</p>
          <p className="mt-2 text-sm text-muted">No Jokers match your search.</p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 border border-foreground px-4 py-2 font-mono text-xs uppercase tracking-[0.15em] hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            Clear filters
          </button>
        </div>
      )}
    </section>
  );
}
