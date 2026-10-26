"use client";

export type SortOrder = "az" | "za";

const chip =
  "border border-foreground px-3 py-1.5 font-mono text-xs uppercase tracking-[0.15em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

export function FilterBar({
  rarities,
  selected,
  onSelect,
  sort,
  onSort,
}: {
  rarities: string[];
  selected: string | null;
  onSelect: (rarity: string | null) => void;
  sort: SortOrder;
  onSort: (sort: SortOrder) => void;
}) {
  const options = [null, ...rarities];

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      {rarities.length > 1 && (
        <div role="group" aria-label="Filter by rarity" className="flex flex-wrap gap-2">
          {options.map((rarity) => {
            const active = selected === rarity;
            return (
              <button
                key={rarity ?? "all"}
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(rarity)}
                className={`${chip} ${active ? "bg-foreground text-background" : "hover:bg-subtle"}`}
              >
                {rarity ?? "All"}
              </button>
            );
          })}
        </div>
      )}

      <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em]">
        Sort
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as SortOrder)}
          className="border border-foreground bg-background px-2 py-1.5 font-mono text-xs uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          <option value="az">Name A–Z</option>
          <option value="za">Name Z–A</option>
        </select>
      </label>
    </div>
  );
}
