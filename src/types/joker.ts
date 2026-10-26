/** A cropped cell of a sprite sheet, with dimensions in source pixels. */
export interface JokerSprite {
  url: string;
  sheetWidth: number;
  sheetHeight: number;
  cellWidth: number;
  cellHeight: number;
  /** Cell column/row inside the sheet (Balatro `pos`). */
  x: number;
  y: number;
}

export interface JokerVar {
  value: string | number;
  /** True when the value starts here but changes during a run. */
  dynamic: boolean;
}

export interface Joker {
  /** Short key as written in the Lua file, e.g. `forgotten_man`. */
  key: string;
  /** Full in-game key, e.g. `j_aws_forgotten_man`. */
  fullKey: string;
  name: string;
  /** Vanilla rarities are 1–4; Steamodded also allows custom string keys. */
  rarity: number | string | null;
  rarityLabel: string;
  cost: number | null;
  /** Description lines, still containing Balatro `{C:...}` markup and `#n#` variables. */
  text: string[];
  /** Starting values for `#1#`, `#2#`, …; `null` where they can't be determined. */
  vars: (JokerVar | null)[];
  sprite: JokerSprite | null;
  /** True when the Joker uses the mod's shared placeholder atlas. */
  placeholderArt: boolean;
}

export interface ModInfo {
  name: string;
  description: string | null;
  version: string | null;
  authors: string[];
  prefix: string;
}

export interface JokerCatalog {
  mod: ModInfo;
  jokers: Joker[];
  repo: string;
  branch: string;
  repoUrl: string;
  /** `manifest` = wiki/jokers.json, `lua` = extracted from Lua definitions. */
  source: "manifest" | "lua";
  /** Non-fatal problems found while syncing (missing art, mismatched keys…). */
  warnings: string[];
  syncedAt: string;
}

/** Shape of the optional `wiki/jokers.json` file in the mod repository. */
export interface JokerManifest {
  atlases?: { key: string; path: string; px?: number; py?: number }[];
  jokers: {
    key: string;
    name: string;
    rarity?: number | string;
    cost?: number;
    atlas?: string;
    pos?: { x: number; y: number };
    text?: string[];
    /** Plain values are shown as fixed; use `{ "value": 1, "dynamic": true }` for values that change. */
    vars?: (string | number | JokerVar)[];
  }[];
}
