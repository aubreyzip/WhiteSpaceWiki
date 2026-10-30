import type { ContentItem } from "@/types/content";

export type SortOrder = "az" | "za";

/**
 * Search and sort for any category. Both use only `name`, which every item has,
 * so they work the same for Jokers, Vouchers and future categories.
 */
export function filterAndSort<T extends ContentItem>(items: readonly T[], query: string, sort: SortOrder): T[] {
  const q = query.trim().toLowerCase();
  return items
    .filter((item) => !q || item.name.toLowerCase().includes(q))
    .sort((a, b) => (sort === "az" ? 1 : -1) * a.name.localeCompare(b.name));
}
