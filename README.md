# WhiteSpaceWiki

A small, monochrome wiki for **Aubrey's White Space**, a Balatro mod.
All Joker data and artwork are loaded from the public mod repository,
[aubreyzip/WhiteSpace](https://github.com/aubreyzip/WhiteSpace). Nothing is hard-coded here.

- Gallery with name search, rarity filters and A–Z / Z–A sorting
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
3. **Jokers:**
   - If `wiki/jokers.json` exists, it is used as-is (see below).
   - Otherwise every `src/jokers/*.lua` file is read and the literal fields of its `SMODS.Joker({...})` call are extracted: `key`, `atlas`, `pos`, `rarity`, `cost`, `loc_txt`.
4. **Text:** taken from `localization/en-us.lua` (`descriptions.Joker.j_<prefix>_<key>`), falling back to the Joker's `loc_txt`.
5. **Artwork:** the Joker's `atlas` (with the `aws_` prefix stripped) is looked up in `src/atlases.lua`. Its PNG comes from `assets/2x/`, and the cell is cropped at `pos` using `px × py` (71 × 95) at 2× scale. Each sheet's size is read from its PNG header.
6. **Fallback art:** Jokers without resolvable art show `public/images/placeholder.png`.

All requests run inside one `"use cache"` function with `cacheLife("hours")`. Pages are prerendered at build time and refreshed in the background at most once an hour, so normal traffic costs roughly one GitHub API request per hour. Raw file downloads from `raw.githubusercontent.com` don't count against the API limit.

The Lua reader ([`src/lib/lua.ts`](src/lib/lua.ts)) never runs code. It only keeps literal strings, numbers, booleans and tables, and skips functions and expressions. Gameplay logic can change freely without breaking the wiki.

### Sync notes

Problems found during sync are listed under **Sync notes** at the bottom of the home page: missing art, unknown atlases, filename case mismatches, and localization keys that match no Joker. They are worth fixing in the mod too. For example, `forgotten_man.png` vs `Forgotten_man.png` works on Windows but not on Linux/macOS.

### Limits of reading Lua

- `#1#`-style values are calculated in-game by `loc_vars`, so the Lua reader can't know them. They show as a dashed **?** box.
- Values built from expressions (e.g. `cost = base + 1`) are ignored.

## Recommended: add `wiki/jokers.json` to the mod

For fully reliable data, the smallest change is one JSON file in the mod repo at `wiki/jokers.json`. When it exists, the wiki uses it instead of the Lua files:

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
- `vars` fills in `#1#`, `#2#`, … with display values.
- `atlases` (`[{ "key", "path", "px", "py" }]`) can also be added. Otherwise `src/atlases.lua` is still used.

The schema is the `JokerManifest` type in [`src/types/joker.ts`](src/types/joker.ts).

## Project structure

```
public/images/        favicon.ico, placeholder.png (fallback art)
src/app/              layout, home page, loading/error/404
src/components/       JokerCard, JokerGallery, SearchBar, FilterBar, SiteHeader, JokerArt, JokerDescription
src/lib/github.ts     fetching, caching and mapping of repository data
src/lib/lua.ts        read-only Lua table reader
src/types/joker.ts    shared types and the manifest schema
```

Fan-made. Not affiliated with LocalThunk (Balatro) or OMOCAT (OMORI).
