import type { CategoryId } from "@/lib/categories";
import { rarityRank } from "@/lib/rarity";
import type { ContentItem } from "@/types/content";

type Compare = (a: ContentItem, b: ContentItem) => number;

const byName: Compare = (a, b) => a.name.localeCompare(b.name);

/**
 * Orders Jokers by rarity rank. Equal ranks return 0, so the stable sort keeps their existing
 * order; Jokers without a known rarity (and any non-Joker) go last in either direction.
 */
const byRarity =
  (direction: 1 | -1): Compare =>
  (a, b) => {
    const ra = a.category === "jokers" ? rarityRank(a.rarity) : null;
    const rb = b.category === "jokers" ? rarityRank(b.rarity) : null;
    if (ra === rb) return 0;
    if (ra === null) return 1;
    if (rb === null) return -1;
    return direction * (ra - rb);
  };

/** Every sort mode. An option with a `category` is only offered for that category. */
export const SORT_OPTIONS = [
  { id: "az", label: "Name A–Z", compare: byName },
  { id: "za", label: "Name Z–A", compare: (a, b) => -byName(a, b) },
  { id: "rarity-asc", label: "Rarity: Common → Legendary", category: "jokers", compare: byRarity(1) },
  { id: "rarity-desc", label: "Rarity: Legendary → Common", category: "jokers", compare: byRarity(-1) },
] as const satisfies readonly { id: string; label: string; category?: CategoryId; compare: Compare }[];

export type SortOrder = (typeof SORT_OPTIONS)[number]["id"];
export type SortOption = (typeof SORT_OPTIONS)[number];

export const DEFAULT_SORT: SortOrder = "az";

/** The sort modes offered for a category. */
export function sortOptionsFor(category: CategoryId): SortOption[] {
  return SORT_OPTIONS.filter((option) => !("category" in option) || option.category === category);
}

/** The requested sort when the category offers it, otherwise the default, so switching categories never leaves an invalid sort. */
export function effectiveSort(requested: SortOrder, category: CategoryId): SortOrder {
  return sortOptionsFor(category).some((option) => option.id === requested) ? requested : DEFAULT_SORT;
}

/**
 * Search and sort for any category. Search uses only `name`, which every item has. Returns a
 * new array; `items` is never mutated. Sorting is stable, so ties keep the order of `items`.
 */
export function filterAndSort<T extends ContentItem>(items: readonly T[], query: string, sort: SortOrder): T[] {
  const q = query.trim().toLowerCase();
  const { compare } = SORT_OPTIONS.find((option) => option.id === sort) ?? SORT_OPTIONS[0];
  return items.filter((item) => !q || item.name.toLowerCase().includes(q)).sort(compare);
}
