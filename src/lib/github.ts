import { cacheLife, cacheTag } from "next/cache";
import type { Joker, JokerCatalog, JokerManifest, JokerSprite, JokerVar, ModInfo } from "@/types/joker";
import { BASE_VALUES } from "@/lib/base-values";
import { resolveLocVars } from "@/lib/loc-vars";
import {
  asNumber,
  asString,
  asStringList,
  asTable,
  findConstructorCalls,
  parseReturnedTable,
  type LuaTable,
} from "@/lib/lua";

// Server-only configuration. GITHUB_TOKEN is optional and never sent to the client.
const REPO = process.env.GITHUB_REPO || "aubreyzip/WhiteSpace";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN = process.env.GITHUB_TOKEN;

// Paths inside the mod repository (Steamodded conventions).
const MANIFEST_PATH = "wiki/jokers.json";
const MOD_JSON_PATH = "WhiteSpace.json";
const JOKERS_DIR = "src/jokers/";
const ATLASES_PATH = "src/atlases.lua";
const LOCALIZATION_PATH = "localization/en-us.lua";
const ASSETS_DIR = "assets/2x/";
const ASSET_SCALE = 2; // assets/2x is twice the atlas `px`/`py`

const RARITY_LABELS: Record<number, string> = { 1: "Common", 2: "Uncommon", 3: "Rare", 4: "Legendary" };

export class GitHubError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

const rawUrl = (path: string) => `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${encodePath(path)}`;
const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

async function fetchRaw(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(rawUrl(path), init);
  if (!res.ok && res.status !== 206) throw new GitHubError(`Could not load ${path} (HTTP ${res.status})`, res.status);
  return res;
}

async function fetchOptionalText(path: string, files: Set<string>): Promise<string | null> {
  if (!files.has(path)) return null;
  return (await fetchRaw(path)).text();
}

/**
 * Lists every file in the repository. Uses the GitHub tree API (60 requests/hour
 * without a token) and falls back to jsDelivr's mirror when rate limited.
 */
async function listRepoFiles(): Promise<string[]> {
  const headers: HeadersInit = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

  let githubError: string;
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`, { headers });
    if (res.ok) {
      const data = (await res.json()) as { tree: { path: string; type: string }[] };
      return data.tree.filter((e) => e.type === "blob").map((e) => e.path);
    }
    const limited = res.status === 429 || (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0");
    if (res.status === 404) throw new GitHubError(`Repository ${REPO}@${BRANCH} was not found.`, 404);
    githubError = limited ? "GitHub API rate limit reached" : `GitHub API returned HTTP ${res.status}`;
  } catch (error) {
    if (error instanceof GitHubError) throw error;
    githubError = `GitHub API unreachable (${(error as Error).message})`;
  }

  const res = await fetch(`https://data.jsdelivr.com/v1/packages/gh/${REPO}@${BRANCH}?structure=flat`);
  if (!res.ok) {
    throw new GitHubError(`${githubError}, and the jsDelivr fallback returned HTTP ${res.status}. Try again later.`, res.status);
  }
  const data = (await res.json()) as { files: { name: string }[] };
  return data.files.map((f) => f.name.replace(/^\//, ""));
}

/** Reads width/height from a PNG header with a small ranged request. */
async function getPngSize(path: string): Promise<{ width: number; height: number } | null> {
  try {
    const res = await fetchRaw(path, { headers: { Range: "bytes=0-23" } });
    const bytes = new Uint8Array(await res.arrayBuffer());
    const view = new DataView(bytes.buffer);
    if (bytes.length < 24 || view.getUint32(12) !== 0x49484452 /* IHDR */) return null;
    return { width: view.getUint32(16), height: view.getUint32(20) };
  } catch {
    return null;
  }
}

interface AtlasDef {
  key: string;
  path: string;
  px: number;
  py: number;
}

interface RawJoker {
  key: string;
  name: string | null;
  rarity: number | string | null;
  cost: number | null;
  atlas: string | null;
  pos: { x: number; y: number };
  text: string[];
  vars: (JokerVar | null)[];
}

function readAtlases(src: string): AtlasDef[] {
  return findConstructorCalls(src, "SMODS.Atlas").flatMap((t) => {
    const key = asString(t.fields.key);
    const path = asString(t.fields.path);
    if (!key || !path) return [];
    return [{ key, path, px: asNumber(t.fields.px) ?? 71, py: asNumber(t.fields.py) ?? 95 }];
  });
}

/** `src` is the Joker's file, used to resolve `loc_vars` (only when the file defines one Joker). */
function readJokerTable(t: LuaTable, src: string | null): RawJoker | null {
  const key = asString(t.fields.key);
  if (!key) return null;
  const pos = asTable(t.fields.pos);
  const locTxt = asTable(t.fields.loc_txt);
  const rarity = t.fields.rarity;
  const extra = asTable(asTable(t.fields.config)?.fields.extra ?? null);
  return {
    key,
    name: locTxt ? asString(locTxt.fields.name) : null,
    rarity: typeof rarity === "number" || typeof rarity === "string" ? rarity : null,
    cost: asNumber(t.fields.cost),
    atlas: asString(t.fields.atlas),
    pos: { x: (pos && asNumber(pos.fields.x)) ?? 0, y: (pos && asNumber(pos.fields.y)) ?? 0 },
    text: locTxt ? asStringList(locTxt.fields.text) : [],
    vars: src ? resolveLocVars(src, extra?.fields ?? {}) : [],
  };
}

function readLocalization(src: string | null): Record<string, { name: string | null; text: string[] }> {
  const root = src ? parseReturnedTable(src) : null;
  const jokers = asTable(asTable(asTable(root?.fields.descriptions)?.fields.Joker ?? null) ?? null);
  const result: Record<string, { name: string | null; text: string[] }> = {};
  for (const [key, value] of Object.entries(jokers?.fields ?? {})) {
    const entry = asTable(value);
    if (entry) result[key] = { name: asString(entry.fields.name), text: asStringList(entry.fields.text) };
  }
  return result;
}

const prettify = (key: string) => key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Fetches the mod repository and maps it to a list of Jokers. Cached for hours,
 * so normal traffic costs one GitHub API request per revalidation.
 */
export async function getJokerCatalog(): Promise<JokerCatalog> {
  "use cache";
  cacheLife("hours");
  cacheTag("github");

  const fileList = await listRepoFiles();
  const files = new Set(fileList);
  const warnings: string[] = [];

  // Mod metadata (WhiteSpace.json)
  let mod: ModInfo = { name: REPO.split("/")[1], description: null, version: null, authors: [], prefix: "aws" };
  const modJson = await fetchOptionalText(MOD_JSON_PATH, files);
  if (modJson) {
    try {
      const data = JSON.parse(modJson);
      mod = {
        name: data.name ?? mod.name,
        description: data.description ?? null,
        version: data.version ?? null,
        authors: Array.isArray(data.author) ? data.author : data.author ? [data.author] : [],
        prefix: data.prefix ?? mod.prefix,
      };
    } catch {
      warnings.push(`${MOD_JSON_PATH} is not valid JSON.`);
    }
  }

  // Jokers + atlases: prefer the structured manifest, otherwise read the Lua sources.
  let rawJokers: RawJoker[];
  let atlases: AtlasDef[];
  let source: JokerCatalog["source"];
  const manifestText = await fetchOptionalText(MANIFEST_PATH, files);

  if (manifestText) {
    source = "manifest";
    let manifest: JokerManifest;
    try {
      manifest = JSON.parse(manifestText);
    } catch {
      throw new GitHubError(`${MANIFEST_PATH} exists but is not valid JSON.`);
    }
    rawJokers = (manifest.jokers ?? []).map((j) => ({
      key: j.key,
      name: j.name,
      rarity: j.rarity ?? null,
      cost: j.cost ?? null,
      atlas: j.atlas ?? null,
      pos: j.pos ?? { x: 0, y: 0 },
      text: j.text ?? [],
      vars: (j.vars ?? []).map((v) => (typeof v === "object" ? v : { value: v, dynamic: false })),
    }));
    atlases = manifest.atlases
      ? manifest.atlases.map((a) => ({ key: a.key, path: a.path, px: a.px ?? 71, py: a.py ?? 95 }))
      : readAtlases((await fetchOptionalText(ATLASES_PATH, files)) ?? "");
  } else {
    source = "lua";
    const jokerFiles = fileList.filter((p) => p.startsWith(JOKERS_DIR) && p.endsWith(".lua")).sort();
    const [atlasSrc, ...jokerSrcs] = await Promise.all([
      fetchOptionalText(ATLASES_PATH, files),
      ...jokerFiles.map((p) => fetchRaw(p).then((r) => r.text())),
    ]);
    atlases = readAtlases(atlasSrc ?? "");
    if (!atlasSrc) warnings.push(`${ATLASES_PATH} not found; artwork cannot be resolved.`);

    rawJokers = jokerFiles.flatMap((path, i) => {
      const tables = findConstructorCalls(jokerSrcs[i], "SMODS.Joker");
      if (tables.length === 0) warnings.push(`No SMODS.Joker definition found in ${path}.`);
      return tables.flatMap((t) => readJokerTable(t, tables.length === 1 ? jokerSrcs[i] : null) ?? []);
    });
  }

  const localization = readLocalization(await fetchOptionalText(LOCALIZATION_PATH, files));

  // Resolve atlas images (case-insensitively, since Windows hides casing mistakes).
  const assetsByLowerName = new Map(
    fileList.filter((p) => p.startsWith(ASSETS_DIR)).map((p) => [p.slice(ASSETS_DIR.length).toLowerCase(), p]),
  );
  const sheetSizes = new Map<string, { width: number; height: number } | null>();
  await Promise.all(
    [...new Set(atlases.map((a) => assetsByLowerName.get(a.path.toLowerCase())).filter(Boolean) as string[])].map(
      async (path) => sheetSizes.set(path, await getPngSize(path)),
    ),
  );

  const jokers: Joker[] = rawJokers.map((raw) => {
    const fullKey = `j_${mod.prefix}_${raw.key}`;
    const loc = localization[fullKey];
    const name = loc?.name ?? raw.name ?? prettify(raw.key);
    const text = loc?.text.length ? loc.text : raw.text;
    if (!text.length) warnings.push(`${name}: no description found (${fullKey}).`);

    // Fill `#n#` values the code can't resolve from the documented base values; all of those change in play.
    const varCount = Math.max(0, ...text.flatMap((line) => [...line.matchAll(/#(\d+)#/g)].map((m) => Number(m[1]))));
    const base = BASE_VALUES[fullKey] ?? [];
    const vars = Array.from({ length: varCount }, (_, n): JokerVar | null => {
      if (raw.vars[n]) return raw.vars[n];
      if (base[n] != null) return { value: base[n], dynamic: true };
      warnings.push(`${name}: the value of #${n + 1}# is calculated in game and couldn't be determined.`);
      return null;
    });

    let sprite: JokerSprite | null = null;
    const atlasKey = raw.atlas?.replace(new RegExp(`^${mod.prefix}_`), "") ?? null;
    const atlas = atlases.find((a) => a.key === atlasKey);
    if (!raw.atlas) {
      warnings.push(`${name}: no atlas set.`);
    } else if (!atlas) {
      warnings.push(`${name}: atlas "${raw.atlas}" is not defined in ${ATLASES_PATH}.`);
    } else {
      const assetPath = assetsByLowerName.get(atlas.path.toLowerCase());
      const size = assetPath ? sheetSizes.get(assetPath) : null;
      if (!assetPath) {
        warnings.push(`${name}: image ${ASSETS_DIR}${atlas.path} is missing.`);
      } else if (!size) {
        warnings.push(`${name}: could not read the size of ${assetPath}.`);
      } else {
        if (!assetPath.endsWith(atlas.path)) {
          warnings.push(`Atlas "${atlas.key}" points to ${atlas.path} but the file is ${assetPath} (case mismatch; breaks on Linux/macOS).`);
        }
        sprite = {
          url: rawUrl(assetPath),
          sheetWidth: size.width,
          sheetHeight: size.height,
          cellWidth: atlas.px * ASSET_SCALE,
          cellHeight: atlas.py * ASSET_SCALE,
          x: raw.pos.x,
          y: raw.pos.y,
        };
      }
    }

    return {
      key: raw.key,
      fullKey,
      name,
      rarity: raw.rarity,
      rarityLabel:
        typeof raw.rarity === "number" ? (RARITY_LABELS[raw.rarity] ?? `Rarity ${raw.rarity}`) : (raw.rarity ?? "Unknown"),
      cost: raw.cost,
      text,
      vars,
      sprite,
      placeholderArt: atlasKey === "placeholders",
    };
  });

  const knownKeys = new Set(jokers.map((j) => j.fullKey));
  for (const key of Object.keys(localization)) {
    if (!knownKeys.has(key)) warnings.push(`${LOCALIZATION_PATH} has an entry for ${key}, but no Joker uses that key.`);
  }

  return {
    mod,
    jokers: jokers.sort((a, b) => a.name.localeCompare(b.name)),
    repo: REPO,
    branch: BRANCH,
    repoUrl: `https://github.com/${REPO}`,
    source,
    warnings: [...new Set(warnings)],
    syncedAt: new Date().toISOString(),
  };
}
