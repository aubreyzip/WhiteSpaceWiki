import type { CategoryId } from "@/lib/categories";

/** A cropped cell of a sprite sheet, with dimensions in source pixels. */
export interface Sprite {
  url: string;
  sheetWidth: number;
  sheetHeight: number;
  cellWidth: number;
  cellHeight: number;
  /** Cell column/row inside the sheet (Balatro `pos`). */
  x: number;
  y: number;
}

/** A value for a `#n#` placeholder in a description. */
export interface TextVar {
  value: string | number;
  /** True when the value starts here but changes during a run. */
  dynamic: boolean;
}

/** Fields every gallery item has, whatever its category. */
export interface BaseItem {
  /** Short key as written in the Lua file, e.g. `forgotten_man`. */
  key: string;
  /** Full in-game key, e.g. `j_aws_forgotten_man`. */
  fullKey: string;
  name: string;
  /** `null` when the definition doesn't set a cost. */
  cost: number | null;
  /** Description lines, still containing Balatro `{C:...}` markup and `#n#` variables. */
  text: string[];
  /** Starting values for `#1#`, `#2#`, …; `null` where they can't be determined. */
  vars: (TextVar | null)[];
  sprite: Sprite | null;
  /** True when the item uses the mod's shared placeholder atlas. */
  placeholderArt: boolean;
}

export interface Joker extends BaseItem {
  category: "jokers";
  /** Vanilla rarities are 1–4; Steamodded also allows custom string keys. */
  rarity: number | string | null;
  rarityLabel: string;
}

export interface VoucherRequirement {
  /** Full key of the required Voucher, e.g. `v_aws_oversupply`. */
  key: string;
  /** Its name when it's defined by this mod; `null` for Vouchers from elsewhere. */
  name: string | null;
}

export interface Voucher extends BaseItem {
  category: "vouchers";
  /** Vouchers that must be redeemed first (Steamodded `requires`); empty for base Vouchers. */
  requires: VoucherRequirement[];
}

export type ContentItem = Joker | Voucher;

export type ItemOf<C extends CategoryId> = Extract<ContentItem, { category: C }>;

/** One category's data: its items, or why they couldn't be loaded. */
export type Section<T> =
  | { status: "ok"; items: T[]; /** Where the items were read from, e.g. `src/jokers/*.lua`. */ source: string }
  | { status: "error"; message: string };

export type CatalogSections = { [C in CategoryId]: Section<ItemOf<C>> };

export interface ModInfo {
  name: string;
  description: string | null;
  version: string | null;
  authors: string[];
  prefix: string;
}

export interface Catalog {
  mod: ModInfo;
  sections: CatalogSections;
  repo: string;
  branch: string;
  repoUrl: string;
  /** Non-fatal problems found while syncing (missing art, mismatched keys…). */
  warnings: string[];
  syncedAt: string;
}

/** One entry of an optional `wiki/<category>.json` manifest in the mod repository. */
export interface ManifestEntry {
  key: string;
  name: string;
  cost?: number;
  atlas?: string;
  pos?: { x: number; y: number };
  text?: string[];
  /** Plain values are shown as fixed; use `{ "value": 1, "dynamic": true }` for values that change. */
  vars?: (string | number | TextVar)[];
  /** Jokers only. */
  rarity?: number | string;
  /** Vouchers only: full keys of required Vouchers. */
  requires?: string[];
}

/** Shape of `wiki/<category>.json`: entries under the category's id, e.g. `{ "jokers": [...] }`. */
export type ContentManifest = { atlases?: { key: string; path: string; px?: number; py?: number }[] } & {
  [C in CategoryId]?: ManifestEntry[];
};
