import { cacheLife, cacheTag } from "next/cache";
import { CATEGORIES, CATEGORY_LIST, type CategoryId } from "@/lib/categories";
import type {
  BaseItem,
  Catalog,
  CatalogSections,
  ContentManifest,
  ItemOf,
  ManifestEntry,
  ModInfo,
  Section,
  Sprite,
  TextVar,
} from "@/types/content";
import { BASE_VALUES } from "@/lib/base-values";
import { mutatedFields, resolveLocVars } from "@/lib/loc-vars";
import {
  asNumber,
  asString,
  asStringList,
  asTable,
  findConstructorCalls,
  parseReturnedTable,
  type ConstructorCall,
} from "@/lib/lua";

// Server-only configuration. GITHUB_TOKEN is optional and never sent to the client.
const REPO = process.env.GITHUB_REPO || "aubreyzip/WhiteSpace";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN = process.env.GITHUB_TOKEN;

// Paths inside the mod repository (Steamodded conventions). Per-category paths live in lib/categories.ts.
const MOD_JSON_PATH = "WhiteSpace.json";
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

/** Reads a category-specific field the same way from a Lua table or a manifest entry. */
interface FieldReader {
  value(name: string): string | number | null;
  list(name: string): string[];
}

/** An item's shared fields as found in the source, before localization and artwork are applied. */
interface RawItem {
  key: string;
  name: string | null;
  cost: number | null;
  atlas: string | null;
  pos: { x: number; y: number };
  text: string[];
  vars: (TextVar | null)[];
  read: FieldReader;
}

interface RawSection {
  items: RawItem[];
  source: string;
  atlases: AtlasDef[];
}

interface Localized {
  name: string | null;
  text: string[];
}

/** Everything the per-item mapping needs, loaded once for all categories. */
interface BuildContext {
  mod: ModInfo;
  atlases: AtlasDef[];
  assetsByLowerName: Map<string, string>;
  sheetSizes: Map<string, { width: number; height: number } | null>;
  /** Localization entries by set (`Joker`, `Voucher`, …), then full key. */
  localization: Record<string, Record<string, Localized>>;
  /** Display name of any item in the catalog, by full key. */
  nameOf: (fullKey: string) => string | null;
  warnings: string[];
}

function readAtlases(src: string): AtlasDef[] {
  return findConstructorCalls(src, "SMODS.Atlas").flatMap(({ table: t }) => {
    const key = asString(t.fields.key);
    const path = asString(t.fields.path);
    if (!key || !path) return [];
    return [{ key, path, px: asNumber(t.fields.px) ?? 71, py: asNumber(t.fields.py) ?? 95 }];
  });
}

/** Shared fields of one `SMODS.<Constructor>({...})` definition. `mutated` comes from its whole file. */
function readDefinition({ table: t, tokens }: ConstructorCall, mutated: Set<string>): RawItem | null {
  const key = asString(t.fields.key);
  if (!key) return null;
  const pos = asTable(t.fields.pos);
  const locTxt = asTable(t.fields.loc_txt);
  const extra = asTable(asTable(t.fields.config)?.fields.extra ?? null);
  return {
    key,
    name: locTxt ? asString(locTxt.fields.name) : null,
    cost: asNumber(t.fields.cost),
    atlas: asString(t.fields.atlas),
    pos: { x: (pos && asNumber(pos.fields.x)) ?? 0, y: (pos && asNumber(pos.fields.y)) ?? 0 },
    text: locTxt ? asStringList(locTxt.fields.text) : [],
    vars: resolveLocVars(tokens, extra?.fields ?? {}, mutated),
    read: {
      value: (name) => {
        const v = t.fields[name];
        return typeof v === "string" || typeof v === "number" ? v : null;
      },
      list: (name) => asStringList(t.fields[name]),
    },
  };
}

function readManifestEntry(entry: ManifestEntry): RawItem {
  const fields: Record<string, unknown> = { ...entry };
  return {
    key: entry.key,
    name: entry.name,
    cost: entry.cost ?? null,
    atlas: entry.atlas ?? null,
    pos: entry.pos ?? { x: 0, y: 0 },
    text: entry.text ?? [],
    vars: (entry.vars ?? []).map((v) => (typeof v === "object" ? v : { value: v, dynamic: false })),
    read: {
      value: (name) => {
        const v = fields[name];
        return typeof v === "string" || typeof v === "number" ? v : null;
      },
      list: (name) => {
        const v = fields[name];
        if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
        return typeof v === "string" ? [v] : [];
      },
    },
  };
}

/** Loads one category's items: from its manifest when the repo has one, otherwise from its Lua files. */
async function loadRawSection(id: CategoryId, fileList: string[], files: Set<string>, warnings: string[]): Promise<RawSection> {
  const { source } = CATEGORIES[id];

  const manifestText = await fetchOptionalText(source.manifest, files);
  if (manifestText) {
    let manifest: ContentManifest;
    try {
      manifest = JSON.parse(manifestText);
    } catch {
      throw new GitHubError(`${source.manifest} exists but is not valid JSON.`);
    }
    return {
      items: (manifest[id] ?? []).map(readManifestEntry),
      source: source.manifest,
      atlases: (manifest.atlases ?? []).map((a) => ({ key: a.key, path: a.path, px: a.px ?? 71, py: a.py ?? 95 })),
    };
  }

  const paths = fileList.filter((p) => p.startsWith(source.dir) && p.endsWith(".lua")).sort();
  const sources = await Promise.all(paths.map((p) => fetchRaw(p).then((r) => r.text())));
  const items = paths.flatMap((path, i) => {
    const calls = findConstructorCalls(sources[i], source.constructor);
    if (calls.length === 0) warnings.push(`No ${source.constructor} definition found in ${path}.`);
    const mutated = mutatedFields(sources[i]);
    return calls.flatMap((call) => readDefinition(call, mutated) ?? []);
  });
  return { items, source: `${source.dir}*.lua`, atlases: [] };
}

function readLocalization(src: string | null): Record<string, Record<string, Localized>> {
  const root = src ? parseReturnedTable(src) : null;
  const descriptions = asTable(root?.fields.descriptions ?? null);
  const result: Record<string, Record<string, Localized>> = {};
  for (const [set, entries] of Object.entries(descriptions?.fields ?? {})) {
    const byKey: Record<string, Localized> = {};
    for (const [key, value] of Object.entries(asTable(entries ?? null)?.fields ?? {})) {
      const entry = asTable(value ?? null);
      if (entry) byKey[key] = { name: asString(entry.fields.name), text: asStringList(entry.fields.text) };
    }
    result[set] = byKey;
  }
  return result;
}

async function readModInfo(files: Set<string>, warnings: string[]): Promise<ModInfo> {
  const fallback: ModInfo = { name: REPO.split("/")[1], description: null, version: null, authors: [], prefix: "aws" };
  const modJson = await fetchOptionalText(MOD_JSON_PATH, files);
  if (!modJson) return fallback;
  try {
    const data = JSON.parse(modJson);
    return {
      name: data.name ?? fallback.name,
      description: data.description ?? null,
      version: data.version ?? null,
      authors: Array.isArray(data.author) ? data.author : data.author ? [data.author] : [],
      prefix: data.prefix ?? fallback.prefix,
    };
  } catch {
    warnings.push(`${MOD_JSON_PATH} is not valid JSON.`);
    return fallback;
  }
}

const prettify = (key: string) => key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const fullKeyOf = (id: CategoryId, key: string, prefix: string) => `${CATEGORIES[id].source.keyPrefix}_${prefix}_${key}`;

/** Resolves the item's atlas to a cropped cell of its PNG in the mod repository. */
function resolveSprite(raw: RawItem, atlasKey: string | null, name: string, ctx: BuildContext): Sprite | null {
  const { atlases, assetsByLowerName, sheetSizes, warnings } = ctx;
  const atlas = atlases.find((a) => a.key === atlasKey);
  if (!raw.atlas) {
    warnings.push(`${name}: no atlas set.`);
    return null;
  }
  if (!atlas) {
    warnings.push(`${name}: atlas "${raw.atlas}" is not defined in ${ATLASES_PATH}.`);
    return null;
  }
  const assetPath = assetsByLowerName.get(atlas.path.toLowerCase());
  const size = assetPath ? sheetSizes.get(assetPath) : null;
  if (!assetPath) {
    warnings.push(`${name}: image ${ASSETS_DIR}${atlas.path} is missing.`);
    return null;
  }
  if (!size) {
    warnings.push(`${name}: could not read the size of ${assetPath}.`);
    return null;
  }
  if (!assetPath.endsWith(atlas.path)) {
    warnings.push(`Atlas "${atlas.key}" points to ${atlas.path} but the file is ${assetPath} (case mismatch; breaks on Linux/macOS).`);
  }
  return {
    url: rawUrl(assetPath),
    sheetWidth: size.width,
    sheetHeight: size.height,
    cellWidth: atlas.px * ASSET_SCALE,
    cellHeight: atlas.py * ASSET_SCALE,
    x: raw.pos.x,
    y: raw.pos.y,
  };
}

/** Maps the fields every category shares: localized text, description values and artwork. */
function toBaseItem(id: CategoryId, raw: RawItem, ctx: BuildContext): BaseItem {
  const fullKey = fullKeyOf(id, raw.key, ctx.mod.prefix);
  const loc = ctx.localization[CATEGORIES[id].source.locSet]?.[fullKey];
  const name = loc?.name ?? raw.name ?? prettify(raw.key);
  const text = loc?.text.length ? loc.text : raw.text;
  if (!text.length) ctx.warnings.push(`${name}: no description found (${fullKey}).`);

  // Fill `#n#` values the code can't resolve from the documented base values; all of those change in play.
  const varCount = Math.max(0, ...text.flatMap((line) => [...line.matchAll(/#(\d+)#/g)].map((m) => Number(m[1]))));
  const base = BASE_VALUES[fullKey] ?? [];
  const vars = Array.from({ length: varCount }, (_, n): TextVar | null => {
    if (raw.vars[n]) return raw.vars[n];
    if (base[n] != null) return { value: base[n], dynamic: true };
    ctx.warnings.push(`${name}: the value of #${n + 1}# is calculated in game and couldn't be determined.`);
    return null;
  });

  const atlasKey = raw.atlas?.replace(new RegExp(`^${ctx.mod.prefix}_`), "") ?? null;
  return {
    key: raw.key,
    fullKey,
    name,
    cost: raw.cost,
    text,
    vars,
    sprite: resolveSprite(raw, atlasKey, name, ctx),
    placeholderArt: atlasKey === "placeholders",
  };
}

/** The only category-specific data code: the fields each item type adds to `BaseItem`. */
const BUILDERS: { [C in CategoryId]: (base: BaseItem, read: FieldReader, ctx: BuildContext) => ItemOf<C> } = {
  jokers: (base, read) => {
    const rarity = read.value("rarity");
    return {
      ...base,
      category: "jokers",
      rarity,
      rarityLabel: typeof rarity === "number" ? (RARITY_LABELS[rarity] ?? `Rarity ${rarity}`) : (rarity ?? "Unknown"),
    };
  },
  vouchers: (base, read, ctx) => ({
    ...base,
    category: "vouchers",
    requires: read.list("requires").map((key) => ({ key, name: ctx.nameOf(key) })),
  }),
};

function buildSection<C extends CategoryId>(id: C, raw: RawSection | Error | undefined, ctx: BuildContext): Section<ItemOf<C>> {
  if (!raw || raw instanceof Error) {
    return { status: "error", message: raw?.message ?? `${CATEGORIES[id].label} were not loaded.` };
  }
  const build = BUILDERS[id];
  const items = raw.items.map((r) => build(toBaseItem(id, r, ctx), r.read, ctx)).sort((a, b) => a.name.localeCompare(b.name));

  const { locSet } = CATEGORIES[id].source;
  const known = new Set(items.map((item) => item.fullKey));
  for (const key of Object.keys(ctx.localization[locSet] ?? {})) {
    if (!known.has(key)) {
      ctx.warnings.push(`${LOCALIZATION_PATH} has an entry for ${key}, but no ${CATEGORIES[id].noun} uses that key.`);
    }
  }
  return { status: "ok", items, source: raw.source };
}

/**
 * Fetches the mod repository and maps every category in lib/categories.ts. Cached for hours,
 * so normal traffic costs one GitHub API request per revalidation. Failing to list the
 * repository fails the page; a category that fails to load is reported on its own.
 */
export async function getCatalog(): Promise<Catalog> {
  "use cache";
  cacheTag("github");

  const fileList = await listRepoFiles();
  const files = new Set(fileList);
  const warnings: string[] = [];

  const [mod, atlasSrc, localizationSrc] = await Promise.all([
    readModInfo(files, warnings),
    fetchOptionalText(ATLASES_PATH, files),
    fetchOptionalText(LOCALIZATION_PATH, files),
  ]);
  if (!atlasSrc) warnings.push(`${ATLASES_PATH} not found; artwork cannot be resolved.`);
  const localization = readLocalization(localizationSrc);

  // Load every category's definitions; one failing doesn't affect the others.
  const raw = new Map<CategoryId, RawSection | Error>();
  await Promise.all(
    CATEGORY_LIST.map(async ({ id }) => {
      try {
        raw.set(id, await loadRawSection(id, fileList, files, warnings));
      } catch (error) {
        raw.set(id, error instanceof Error ? error : new Error(String(error)));
      }
    }),
  );
  const loaded = [...raw].flatMap(([id, section]) => (section instanceof Error ? [] : [{ id, section }]));

  // Atlases and sheet sizes, fetched once for all categories.
  const atlases = [...readAtlases(atlasSrc ?? ""), ...loaded.flatMap(({ section }) => section.atlases)];
  const assetsByLowerName = new Map(
    fileList.filter((p) => p.startsWith(ASSETS_DIR)).map((p) => [p.slice(ASSETS_DIR.length).toLowerCase(), p]),
  );
  const sheetSizes = new Map<string, { width: number; height: number } | null>();
  const sheetPaths = new Set(atlases.flatMap((a) => assetsByLowerName.get(a.path.toLowerCase()) ?? []));
  await Promise.all([...sheetPaths].map(async (path) => sheetSizes.set(path, await getPngSize(path))));

  // Names by full key, so items can refer to each other (e.g. a Voucher's requirement).
  const names = new Map<string, string>();
  for (const { id, section } of loaded) {
    for (const item of section.items) {
      const fullKey = fullKeyOf(id, item.key, mod.prefix);
      names.set(fullKey, localization[CATEGORIES[id].source.locSet]?.[fullKey]?.name ?? item.name ?? prettify(item.key));
    }
  }

  const ctx: BuildContext = {
    mod,
    atlases,
    assetsByLowerName,
    sheetSizes,
    localization,
    nameOf: (fullKey) => names.get(fullKey) ?? null,
    warnings,
  };
  const sections: CatalogSections = {
    jokers: buildSection("jokers", raw.get("jokers"), ctx),
    vouchers: buildSection("vouchers", raw.get("vouchers"), ctx),
  };

  // Retry soon when a category failed, instead of keeping the failure for an hour.
  if (Object.values(sections).some((s) => s.status === "error")) cacheLife("minutes");
  else cacheLife("hours");

  return {
    mod,
    sections,
    repo: REPO,
    branch: BRANCH,
    repoUrl: `https://github.com/${REPO}`,
    warnings: [...new Set(warnings)],
    syncedAt: new Date().toISOString(),
  };
}
