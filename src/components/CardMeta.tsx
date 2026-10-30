import { CATEGORIES } from "@/lib/categories";
import type { ContentItem } from "@/types/content";

/** The small metadata line under a card's name; the only category-specific part of a card. */
export function CardMeta({ item }: { item: ContentItem }) {
  switch (item.category) {
    case "jokers":
      return item.rarityLabel;
    case "vouchers":
      return item.requires.length > 0
        ? `Requires ${item.requires.map((r) => r.name ?? r.key).join(", ")}`
        : CATEGORIES.vouchers.noun;
    default: {
      const unhandled: never = item;
      return unhandled;
    }
  }
}
