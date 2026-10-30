/** Balatro's vanilla Joker rarities, lowest to highest. Steamodded's numeric `rarity` 1–4 indexes this list. */
export const JOKER_RARITIES = ["Common", "Uncommon", "Rare", "Legendary"] as const;

export type JokerRarity = (typeof JOKER_RARITIES)[number];

/** Display name for a numeric rarity (1–4), or `null` for anything else. */
export function rarityName(rarity: number): JokerRarity | null {
  return JOKER_RARITIES[rarity - 1] ?? null;
}

/**
 * Position of a Joker's rarity in `JOKER_RARITIES` (0 = Common), from either its numeric
 * value or a rarity name. `null` for missing or custom rarities, which have no place in the order.
 */
export function rarityRank(rarity: number | string | null): number | null {
  if (typeof rarity === "number") return Number.isInteger(rarity) && rarityName(rarity) ? rarity - 1 : null;
  if (typeof rarity === "string") {
    const index = JOKER_RARITIES.findIndex((name) => name.toLowerCase() === rarity.trim().toLowerCase());
    return index === -1 ? null : index;
  }
  return null;
}
