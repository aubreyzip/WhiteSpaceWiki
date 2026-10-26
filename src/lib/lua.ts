/**
 * A deliberately small, read-only Lua reader.
 *
 * It never executes code. It tokenizes a file, finds table constructors
 * (e.g. the argument of `SMODS.Joker({...})` or a `return {...}`), and keeps
 * only literal values: strings, numbers, booleans and nested tables. Functions
 * and other expressions are skipped and come back as `undefined`, so adding
 * new logic to a Joker never breaks the wiki.
 */

export type LuaValue = string | number | boolean | null | LuaTable | undefined;

export interface LuaTable {
  fields: Record<string, LuaValue>;
  items: LuaValue[];
}

export type Token =
  | { type: "name"; value: string }
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "symbol"; value: string };

const SYMBOLS = ["...", "==", "~=", "<=", ">=", "..", "::", "//", "<<", ">>"];
const BLOCK_OPENERS = new Set(["function", "if", "do", "repeat"]);
const BLOCK_CLOSERS = new Set(["end", "until"]);

function longBracketLevel(src: string, i: number): number {
  // Matches `[[`, `[=[`, `[==[` … and returns the number of `=` signs.
  if (src[i] !== "[") return -1;
  let j = i + 1;
  while (src[j] === "=") j++;
  return src[j] === "[" ? j - i - 1 : -1;
}

function readLongBracket(src: string, i: number, level: number) {
  const close = "]" + "=".repeat(level) + "]";
  const start = i + level + 2;
  const end = src.indexOf(close, start);
  if (end === -1) return { value: src.slice(start), next: src.length };
  return { value: src.slice(start, end).replace(/^\r?\n/, ""), next: end + close.length };
}

const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", "\\": "\\", '"': '"', "'": "'" };

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (src.startsWith("--", i)) {
      const level = longBracketLevel(src, i + 2);
      if (level >= 0) {
        i = readLongBracket(src, i + 2, level).next;
      } else {
        const nl = src.indexOf("\n", i);
        i = nl === -1 ? src.length : nl + 1;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      let value = "";
      i++;
      while (i < src.length && src[i] !== ch) {
        if (src[i] === "\\") {
          const esc = src[i + 1];
          value += ESCAPES[esc] ?? esc;
          i += 2;
        } else {
          value += src[i++];
        }
      }
      i++;
      tokens.push({ type: "string", value });
      continue;
    }

    const level = longBracketLevel(src, i);
    if (level >= 0) {
      const { value, next } = readLongBracket(src, i, level);
      tokens.push({ type: "string", value });
      i = next;
      continue;
    }

    const num = /^(0[xX][0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(src.slice(i, i + 64));
    if (num) {
      tokens.push({ type: "number", value: Number(num[0]) });
      i += num[0].length;
      continue;
    }

    const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i, i + 256));
    if (name) {
      tokens.push({ type: "name", value: name[0] });
      i += name[0].length;
      continue;
    }

    const symbol = SYMBOLS.find((s) => src.startsWith(s, i)) ?? ch;
    tokens.push({ type: "symbol", value: symbol });
    i += symbol.length;
  }

  return tokens;
}

class Parser {
  constructor(
    private tokens: Token[],
    public pos = 0,
  ) {}

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.pos + offset];
  }

  private isSymbol(value: string, offset = 0) {
    const t = this.peek(offset);
    return t?.type === "symbol" && t.value === value;
  }

  /** Skips tokens until a `,` `;` or `}` that closes the current field. */
  private skipExpression() {
    let depth = 0;
    let blocks = 0;
    while (this.pos < this.tokens.length) {
      const t = this.tokens[this.pos];
      if (t.type === "name" && BLOCK_OPENERS.has(t.value)) blocks++;
      else if (t.type === "name" && BLOCK_CLOSERS.has(t.value)) blocks--;
      else if (t.type === "symbol") {
        if ("({[".includes(t.value)) depth++;
        else if (")}]".includes(t.value)) {
          if (depth === 0 && blocks === 0) return;
          depth--;
        } else if ((t.value === "," || t.value === ";") && depth === 0 && blocks === 0) return;
      }
      this.pos++;
    }
  }

  parseValue(): LuaValue {
    const t = this.peek();
    let value: LuaValue;
    let literal = true;

    if (!t) return undefined;
    if (t.type === "string" || t.type === "number") {
      value = t.value;
      this.pos++;
    } else if (t.type === "name" && (t.value === "true" || t.value === "false")) {
      value = t.value === "true";
      this.pos++;
    } else if (t.type === "name" && t.value === "nil") {
      value = null;
      this.pos++;
    } else if (this.isSymbol("-") && this.peek(1)?.type === "number") {
      value = -(this.peek(1)!.value as number);
      this.pos += 2;
    } else if (this.isSymbol("{")) {
      value = this.parseTable();
    } else {
      literal = false;
    }

    // Anything that isn't a plain literal (or a literal followed by an operator,
    // e.g. `'a' .. b`) is treated as an unknown expression.
    const atEnd = this.isSymbol(",") || this.isSymbol(";") || this.isSymbol("}") || !this.peek();
    if (!literal || !atEnd) {
      this.skipExpression();
      return undefined;
    }
    return value;
  }

  parseTable(): LuaTable {
    const table: LuaTable = { fields: {}, items: [] };
    this.pos++; // `{`

    while (this.pos < this.tokens.length && !this.isSymbol("}")) {
      const t = this.peek()!;

      if (this.isSymbol("[")) {
        this.pos++;
        const key = this.parseValue();
        if (this.isSymbol("]")) this.pos++;
        if (this.isSymbol("=")) this.pos++;
        const value = this.parseValue();
        if (typeof key === "string" || typeof key === "number") table.fields[String(key)] = value;
      } else if (t.type === "name" && this.isSymbol("=", 1)) {
        this.pos += 2;
        table.fields[t.value] = this.parseValue();
      } else {
        table.items.push(this.parseValue());
      }

      if (this.isSymbol(",") || this.isSymbol(";")) this.pos++;
      else if (!this.isSymbol("}")) this.pos++; // recover from anything unexpected
    }

    this.pos++; // `}`
    return table;
  }
}

/** Finds every `Namespace.Name({...})` / `Namespace.Name{...}` call and returns its table argument. */
export function findConstructorCalls(src: string, callee: string): LuaTable[] {
  const tokens = tokenize(src);
  const parts = callee.split(".");
  const results: LuaTable[] = [];

  for (let i = 0; i < tokens.length; i++) {
    let j = i;
    let matched = true;
    for (let p = 0; p < parts.length; p++) {
      if (p > 0) {
        const dot = tokens[j++];
        if (dot?.type !== "symbol" || dot.value !== ".") matched = false;
      }
      const name = tokens[j++];
      if (name?.type !== "name" || name.value !== parts[p]) matched = false;
      if (!matched) break;
    }
    if (!matched) continue;

    const paren = tokens[j]?.type === "symbol" && tokens[j].value === "(";
    if (paren) j++;
    const brace = tokens[j];
    if (brace?.type !== "symbol" || brace.value !== "{") continue;

    const parser = new Parser(tokens, j);
    results.push(parser.parseTable());
    i = parser.pos;
  }

  return results;
}

/** Parses the table of the first top-level `return {...}` in a file (e.g. localization files). */
export function parseReturnedTable(src: string): LuaTable | null {
  const tokens = tokenize(src);
  const index = tokens.findIndex(
    (t, i) => t.type === "name" && t.value === "return" && tokens[i + 1]?.type === "symbol" && tokens[i + 1].value === "{",
  );
  if (index === -1) return null;
  return new Parser(tokens, index + 1).parseTable();
}

// Small typed accessors so callers don't have to narrow LuaValue by hand.

export function asTable(value: LuaValue): LuaTable | null {
  return value && typeof value === "object" ? value : null;
}

export function asString(value: LuaValue): string | null {
  return typeof value === "string" ? value : null;
}

export function asNumber(value: LuaValue): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function asStringList(value: LuaValue): string[] {
  const table = asTable(value);
  if (table) return table.items.filter((v): v is string => typeof v === "string");
  const single = asString(value);
  return single ? [single] : [];
}
