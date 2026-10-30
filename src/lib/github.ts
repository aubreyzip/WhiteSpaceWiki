import { cacheLife, cacheTag } from "next/cache";
import { CATEGORIES, CATEGORY_LIST, type CategoryId } from "@/lib/categories";
import type {
  BaseItem,
  Catalog,
  CatalogSections,
  ItemOf,
  ModInfo,
  Section,
  Sprite,
  TextVar,
} from "@/types/content";
import { BASE_VALUES } from "@/lib/base-values";
import { rarityName } from "@/lib/rarity";
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

/** Fails fast on a malformed setting, since it becomes part of every request URL. */
function setting(name: string, value: string, pattern: RegExp): string {
  if (!pattern.test(value)) throw new Error(`${name} has an invalid format.`);
  return value;
}

// Server-only configuration. GITHUB_TOKEN is optional and never sent to the client.
const REPO = setting("GITHUB_REPO", process.env.GITHUB_REPO || "aubreyzip/WhiteSpace", /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/);
const BRANCH = setting("GITHUB_BRANCH", process.env.GITHUB_BRANCH || "main", /^(?!.*\.\.)[A-Za-z0-9._/-]+$/);
const TOKEN = process.env.GITHUB_TOKEN;

// Limits for anything fetched from GitHub, so a slow or oversized response can't stall or exhaust a sync.
const FETCH_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

// Paths inside the mod repository (Steamodded conventions). Per-category paths live in lib/categories.ts.
const MOD_JSON_PATH = "WhiteSpace.json";
const ATLASES_PATH = "src/atlases.lua";
const LOCALIZATION_PATH = "localization/en-us.lua";
const ASSETS_DIR = "assets/2x/";
const ASSET_SCALE = 2; // assets/2x is twice the atlas `px`/`py`

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

/** `fetch` with a timeout; every request to GitHub or jsDelivr goes through here. */
const request = (url: string, init?: RequestInit) => fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

/** Reads a response body, stopping as soon as it exceeds `MAX_RESPONSE_BYTES`. */
async function readLimited(res: Response, label: string): Promise<string> {
  const tooLarge = () => new GitHubError(`${label} is too large to load.`);
  if (Number(res.headers.get("content-length")) > MAX_RESPONSE_BYTES) throw tooLarge();
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw tooLarge();
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function fetchRaw(path: string, init?: RequestInit): Promise<Response> {
  const res = await request(rawUrl(path), init);
  if (!res.ok && res.status !== 206) throw new GitHubError(`Could not load ${path} (HTTP ${res.status})`, res.status);
  return res;
}

const fetchText = async (path: string) => readLimited(await fetchRaw(path), path);

async function fetchOptionalText(path: string, files: Set<string>): Promise<string | null> {
  if (!files.has(path)) return null;
  return fetchText(path);
}

// Shape checks for JSON from GitHub, jsDelivr and the mod repository, which is all untrusted input.
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const asText = (v: unknown): string | null => (typeof v === "string" ? v : null);
const asFinite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const textList = (v: unknown): string[] => (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === "string");
const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/**
 * Lists every file in the repository. Uses the GitHub tree API (60 requests/hour
 * without a token) and falls back to jsDelivr's mirror when rate limited.
 */
async function listRepoFiles(): Promise<string[]> {
  const headers: HeadersInit = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

  let githubError: string;
  try {
    const res = await request(`https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`, { headers });
    if (res.ok) {
      const data = parseJson(await readLimited(res, "The repository file list"));
      if (isRecord(data) && Array.isArray(data.tree)) {
        return data.tree.flatMap((e) => (isRecord(e) && e.type === "blob" && typeof e.path === "string" ? [e.path] : []));
      }
      githubError = "GitHub API returned an unexpected response";
    } else {
      const limited = res.status === 429 || (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0");
      if (res.status === 404) throw new GitHubError(`Repository ${REPO}@${BRANCH} was not found.`, 404);
      githubError = limited ? "GitHub API rate limit reached" : `GitHub API returned HTTP ${res.status}`;
    }
  } catch (error) {
    if (error instanceof GitHubError) throw error;
    console.error("GitHub tree API request failed:", error);
    githubError = "GitHub API unreachable";
  }

  const res = await request(`https://data.jsdelivr.com/v1/packages/gh/${REPO}@${BRANCH}?structure=flat`);
  if (!res.ok) {
    throw new GitHubError(`${githubError}, and the jsDelivr fallback returned HTTP ${res.status}. Try again later.`, res.status);
  }
  const data = parseJson(await readLimited(res, "The repository file list"));
  if (!isRecord(data) || !Array.isArray(data.files)) {
    throw new GitHubError(`${githubError}, and the jsDelivr fallback returned an unexpected response. Try again later.`);
  }
  return data.files.flatMap((f) => (isRecord(f) && typeof f.name === "string" ? [f.name.replace(/^\//, "")] : []));
}

/** Reads width/height from a PNG header with a small ranged request. */
async function getPngSize(path: string): Promise<{ width: number; height: number } | null> {
  try {
    const res = await fetchRaw(path, { headers: { Range: "bytes=0-23" } });
    // Read only the header, even if the server ignores the Range request and sends the whole file.
    const bytes = new Uint8Array(24);
    let length = 0;
    const reader = res.body?.getReader();
    while (reader && length < 24) {
      const { done, value } = await reader.read();
      if (done) break;
      const take = value.subarray(0, 24 - length);
      bytes.set(take, length);
      length += take.length;
    }
    await reader?.cancel();
    if (length < 24) return null;
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

/** A `ManifestEntry` from parsed JSON, checked field by field; `null` when `key` or `name` is missing. */
function readManifestEntry(entry: unknown): RawItem | null {
  if (!isRecord(entry)) return null;
  const key = asText(entry.key);
  const name = asText(entry.name);
  if (!key || !name) return null;
  const pos = isRecord(entry.pos) ? entry.pos : {};
  const vars = Array.isArray(entry.vars) ? entry.vars : [];
  return {
    key,
    name,
    cost: asFinite(entry.cost),
    atlas: asText(entry.atlas),
    pos: { x: asFinite(pos.x) ?? 0, y: asFinite(pos.y) ?? 0 },
    text: Array.isArray(entry.text) ? textList(entry.text) : [],
    vars: vars.map((v): TextVar | null => {
      const plain = asText(v) ?? asFinite(v);
      if (plain !== null) return { value: plain, dynamic: false };
      const value = isRecord(v) ? (asText(v.value) ?? asFinite(v.value)) : null;
      return isRecord(v) && value !== null ? { value, dynamic: v.dynamic === true } : null;
    }),
    read: {
      value: (field) => asText(entry[field]) ?? asFinite(entry[field]),
      list: (field) => textList(entry[field]),
    },
  };
}

/** Loads one category's items: from its manifest when the repo has one, otherwise from its Lua files. */
async function loadRawSection(id: CategoryId, fileList: string[], files: Set<string>, warnings: string[]): Promise<RawSection> {
  const { source } = CATEGORIES[id];

  // See `ContentManifest` for the expected shape; every field is checked because the file is external input.
  const manifestText = await fetchOptionalText(source.manifest, files);
  if (manifestText) {
    const manifest = parseJson(manifestText);
    if (!isRecord(manifest)) throw new GitHubError(`${source.manifest} exists but is not a valid manifest.`);
    const entries = Array.isArray(manifest[id]) ? manifest[id] : [];
    const items = entries.flatMap((entry, i) => {
      const item = readManifestEntry(entry);
      if (!item) warnings.push(`${source.manifest}: entry ${i + 1} is missing a key or name and was skipped.`);
      return item ?? [];
    });
    const atlases = (Array.isArray(manifest.atlases) ? manifest.atlases : []).flatMap((a): AtlasDef[] => {
      const key = isRecord(a) ? asText(a.key) : null;
      const path = isRecord(a) ? asText(a.path) : null;
      return isRecord(a) && key && path ? [{ key, path, px: asFinite(a.px) ?? 71, py: asFinite(a.py) ?? 95 }] : [];
    });
    return { items, source: source.manifest, atlases };
  }

  const paths = fileList.filter((p) => p.startsWith(source.dir) && p.endsWith(".lua")).sort();
  const sources = await Promise.all(paths.map(fetchText));
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
  const data = parseJson(modJson);
  if (!isRecord(data)) {
    warnings.push(`${MOD_JSON_PATH} is not valid JSON.`);
    return fallback;
  }
  // The prefix becomes part of every key, so only a plain identifier is accepted.
  const prefix = asText(data.prefix);
  if (prefix !== null && !/^\w+$/.test(prefix)) warnings.push(`${MOD_JSON_PATH}: "prefix" is not a plain identifier; using "${fallback.prefix}".`);
  return {
    name: asText(data.name) ?? fallback.name,
    description: asText(data.description),
    version: asText(data.version) ?? asFinite(data.version)?.toString() ?? null,
    authors: textList(data.author),
    prefix: prefix && /^\w+$/.test(prefix) ? prefix : fallback.prefix,
  };
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

  const modPrefix = `${ctx.mod.prefix}_`;
  const atlasKey = raw.atlas?.startsWith(modPrefix) ? raw.atlas.slice(modPrefix.length) : raw.atlas;
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
      rarityLabel: typeof rarity === "number" ? (rarityName(rarity) ?? `Rarity ${rarity}`) : (rarity ?? "Unknown"),
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
        // Only messages written for visitors are shown; anything else stays in the server log.
        if (!(error instanceof GitHubError)) console.error(`Loading ${id} failed:`, error);
        raw.set(id, error instanceof GitHubError ? error : new GitHubError("The data couldn't be read from GitHub."));
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
