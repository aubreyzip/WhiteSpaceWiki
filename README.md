# WhiteSpaceWiki

A small, monochrome wiki for **Aubrey's White Space**, a Balatro mod.
All Joker and Voucher data and artwork are loaded from the public mod repository,
[aubreyzip/WhiteSpace](https://github.com/aubreyzip/WhiteSpace). Nothing is hard-coded here.

- Gallery with Jokers / Vouchers categories, name search, A–Z / Z–A sorting, and rarity sorting for Jokers
- Light "White Space" and dark "Black Space" themes (follows the OS setting)

Built with Next.js 16 (App Router, Cache Components), TypeScript, Tailwind CSS 4 and Lucide.

## Setup

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (fetches the mod repo at build time)
npm run start
npm run lint
```

`.env.local` (all optional):

| Variable        | Default               | Purpose                                                              |
| --------------- | --------------------- | -------------------------------------------------------------------- |
| `GITHUB_REPO`   | `aubreyzip/WhiteSpace` | Mod repository (`owner/name`)                                        |
| `GITHUB_BRANCH` | `main`                | Branch to read                                                       |
| `GITHUB_TOKEN`  | –                     | Raises the GitHub API limit from 60 to 5000 requests/hour. Server-only. |

No token is needed for public access. Never give the token a `NEXT_PUBLIC_` prefix.

## How synchronization works

Everything lives in [`src/lib/github.ts`](src/lib/github.ts):

1. **List files:** one call to the GitHub tree API. If GitHub rate limits it, the code falls back to jsDelivr's mirror of the repo.
2. **Mod info:** read from `WhiteSpace.json` (name, version, author, description, `prefix`).
3. **Items, per category** (see [Categories](#categories)):
   - If the category's manifest (e.g. `wiki/jokers.json`) exists, it is used as-is (see below).
   - Otherwise every Lua file in its folder is read and the literal fields of each definition (`SMODS.Joker({...})`, `SMODS.Voucher({...})`) are extracted: `key`, `atlas`, `pos`, `cost`, `loc_txt`, plus Joker `rarity` and Voucher `requires`. A file may define several items.
4. **Text:** taken from `localization/en-us.lua` (`descriptions.<Joker|Voucher>.<j|v>_<prefix>_<key>`), falling back to the item's `loc_txt`.
5. **Artwork:** the item's `atlas` (with the `aws_` prefix stripped) is looked up in `src/atlases.lua`. Its PNG comes from `assets/2x/`, and the cell is cropped at `pos` using `px × py` (71 × 95) at 2× scale. Each sheet's size is read from its PNG header.
6. **Fallback art:** items without resolvable art show a cell of `public/images/placeholder.png` chosen by their category.

All requests run inside one `"use cache"` function with `cacheLife("hours")`. Pages are prerendered at build time and refreshed in the background at most once an hour, so normal traffic costs roughly one GitHub API request per hour. Raw file downloads from `raw.githubusercontent.com` don't count against the API limit.

Each category loads independently. If one fails (say, a Voucher file can't be downloaded), the others still show, the failed category says so in the gallery, and the result is only cached for minutes so it retries soon. If the repository can't be listed at all, the error page is shown.

## Categories

Categories are registered in [`src/lib/categories.ts`](src/lib/categories.ts): label, source folder, Steamodded constructor, localization set, key prefix, manifest path and fallback art. Search and the A–Z / Z–A sorts use only the name, which every item has, so they work for any category. A sort that only makes sense for one category (the Joker rarity sorts) sets `category` in `SORT_OPTIONS` in `src/lib/gallery.ts`; other categories don't offer it and fall back to A–Z.

To add one (e.g. Tarot cards):

1. Add an entry to `CATEGORIES` in `src/lib/categories.ts`.
2. Add its item type to `ContentItem` in [`src/types/content.ts`](src/types/content.ts).
3. Add a builder for its specific fields to `BUILDERS` in `src/lib/github.ts`, and list it in `sections` in `getCatalog`.
4. Add its metadata line to [`src/components/CardMeta.tsx`](src/components/CardMeta.tsx).

TypeScript reports each step that's still missing. The category button, search, sorting, empty states and card layout need no changes.

The Lua reader ([`src/lib/lua.ts`](src/lib/lua.ts)) never runs code. It only keeps literal strings, numbers, booleans and tables, and skips functions and expressions. Gameplay logic can change freely without breaking the wiki.

### Sync notes

Problems found during sync are listed under **Sync notes** at the bottom of the home page: missing art, unknown atlases, filename case mismatches, and localization keys that match no Joker. They are worth fixing in the mod too. For example, `forgotten_man.png` vs `Forgotten_man.png` works on Windows but not on Linux/macOS.

### Description values (`#1#`, `#2#`, …)

The game fills these in at runtime through each Joker's `loc_vars` function. The wiki shows their **starting value**:

1. [`src/lib/loc-vars.ts`](src/lib/loc-vars.ts) reads `loc_vars` without running it. It resolves config fields (`card.ability.extra.*`), locals, arithmetic, `math.*` and `SMODS.get_probability_vars`. A value counts as changing if it depends on a config field the Joker's code reassigns, such as Vitamins' chips or Scapegoat's shop count.
2. Values computed from live game state (money, deck contents, the copied Joker) can't be read from config. Their starting values are listed with the code they come from in [`src/lib/base-values.ts`](src/lib/base-values.ts). Re-check an entry when that Joker's code changes.
3. Anything still unknown shows as a dashed **?** box and gets a sync note.

Values that change during a run have a dotted underline, and the card explains what that means.

### Other limits of reading Lua

- Values built from expressions (e.g. `cost = base + 1`) are ignored.

## Recommended: add `wiki/jokers.json` to the mod

For fully reliable data, the smallest change is one JSON file per category in the mod repo: `wiki/jokers.json`, `wiki/vouchers.json`. When one exists, the wiki uses it instead of that category's Lua files. Entries go under the category's id:

```json
{
  "jokers": [
    {
      "key": "caffeine",
      "name": "Caffeine",
      "rarity": 2,
      "cost": 5,
      "atlas": "aws_caffeine",
      "pos": { "x": 0, "y": 0 },
      "text": ["{C:green}#1# in #2#{} chance to", "retrigger each played card"],
      "vars": [1, 3]
    }
  ]
}
```

- `key` and `name` are required. Everything else is optional.
- `text` falls back to `localization/en-us.lua` when omitted.
- `vars` fills in `#1#`, `#2#`, … with display values. Use `{ "value": 1, "dynamic": true }` for a value that changes during a run.
- `rarity` is for Jokers. Vouchers use `"requires": ["v_aws_oversupply"]` (full keys) instead.
- `atlases` (`[{ "key", "path", "px", "py" }]`) can also be added. They're used alongside `src/atlases.lua`.

The schema is the `ContentManifest` type in [`src/types/content.ts`](src/types/content.ts).

## Project structure

```
public/images/        favicon.ico, placeholder.png (fallback art)
src/app/              layout, home page, loading/error/404
src/components/       ContentGallery, ContentCard, CardMeta, CardArt, CardDescription, CategoryNav, SearchBar, SortSelect, SiteHeader
src/lib/categories.ts the category registry
src/lib/github.ts     fetching, caching and mapping of repository data
src/lib/gallery.ts    search and sort options
src/lib/rarity.ts     Joker rarity order (Common → Legendary)
src/lib/lua.ts        read-only Lua table reader
src/types/content.ts  item types, catalog and the manifest schema
```

Fan-made. Not affiliated with LocalThunk (Balatro) or OMOCAT (OMORI).
