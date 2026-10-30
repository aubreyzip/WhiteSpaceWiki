/**
 * The gallery's content categories: the one place a category is registered.
 *
 * To add one (e.g. Tarot cards):
 * 1. Add an entry below.
 * 2. Add its item type to `ContentItem` in types/content.ts.
 * 3. Add a builder for its specific fields to `BUILDERS` in lib/github.ts.
 * 4. Add its metadata line to components/CardMeta.tsx.
 * TypeScript points at each step that's still missing.
 *
 * This file is shared by server and client code, so it holds plain data only.
 */

export interface ContentSource {
  /** Folder of Lua definitions in the mod repository. */
  dir: string;
  /** Steamodded constructor that defines an item, e.g. `SMODS.Joker`. */
  constructor: string;
  /** Set under `descriptions` in the localization file. */
  locSet: string;
  /** In-game key prefix: `j` makes `j_<modprefix>_<key>`. */
  keyPrefix: string;
  /** Optional structured data file that replaces the Lua definitions when present. */
  manifest: string;
}

export interface CategoryConfig<Id extends string = string> {
  id: Id;
  /** Plural label for the category button, e.g. "Jokers". */
  label: string;
  /** Singular noun for one item, e.g. "Joker". */
  noun: string;
  source: ContentSource;
  /** Cell of public/images/placeholder.png shown when an item's artwork can't be found. */
  fallbackArt: { x: number; y: number };
}

const defineCategories = <T extends { [K in keyof T]: CategoryConfig<K & string> }>(categories: T) => categories;

export const CATEGORIES = defineCategories({
  jokers: {
    id: "jokers",
    label: "Jokers",
    noun: "Joker",
    source: {
      dir: "src/jokers/",
      constructor: "SMODS.Joker",
      locSet: "Joker",
      keyPrefix: "j",
      manifest: "wiki/jokers.json",
    },
    fallbackArt: { x: 3, y: 1 },
  },
  vouchers: {
    id: "vouchers",
    label: "Vouchers",
    noun: "Voucher",
    source: {
      dir: "src/vouchers/",
      constructor: "SMODS.Voucher",
      locSet: "Voucher",
      keyPrefix: "v",
      manifest: "wiki/vouchers.json",
    },
    fallbackArt: { x: 0, y: 3 },
  },
});

export type CategoryId = keyof typeof CATEGORIES;

/** Categories in navigation order (definition order). */
export const CATEGORY_LIST = Object.values(CATEGORIES);

export const DEFAULT_CATEGORY: CategoryId = "jokers";
