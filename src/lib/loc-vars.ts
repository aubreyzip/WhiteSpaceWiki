/**
 * Works out the starting values of a card's description variables (`#1#`, `#2#`, …)
 * by reading its `loc_vars` function, without running any Lua.
 *
 * Supported: literals, `card.ability.extra.<field>` (and `local extra = card.ability.extra`),
 * locals, arithmetic, `math.floor/ceil/abs/max/min` and `SMODS.get_probability_vars`.
 * Anything that reads live game state (`G.*`, helper functions, `localize`) stays unknown.
 *
 * A value is "dynamic" when it depends on a config field the card's code reassigns,
 * i.e. it starts at the config value and changes during a run.
 */

import type { LuaValue, Token } from "@/lib/lua";
import type { TextVar } from "@/types/content";

const EXTRA = Symbol("card.ability.extra");
type Prim = number | string | boolean | undefined | typeof EXTRA;
interface Val {
  v: Prim;
  /** Config fields this value was derived from. */
  f: Set<string>;
}

const BLOCK_OPENERS = new Set(["function", "if", "do", "repeat"]);
const BLOCK_CLOSERS = new Set(["end", "until"]);
const MATH: Record<string, (...n: number[]) => number> = {
  floor: Math.floor,
  ceil: Math.ceil,
  abs: Math.abs,
  max: Math.max,
  min: Math.min,
};

const val = (v: Prim, ...from: Val[]): Val => ({ v, f: new Set(from.flatMap((x) => [...x.f])) });
const unknown = (...from: Val[]) => val(undefined, ...from);
const isName = (t: Token | undefined, ...names: string[]) => t?.type === "name" && names.includes(t.value);
const isSym = (t: Token | undefined, ...syms: string[]) => t?.type === "symbol" && syms.includes(t.value);

class Evaluator {
  private i: number;
  private locals = new Map<string, Val>();

  constructor(
    private t: Token[],
    start: number,
    private end: number,
    private extra: Record<string, LuaValue>,
  ) {
    this.i = start;
  }

  /** Runs the function body and returns the `vars` of its last top-level `return`. */
  run(): Val[] | null {
    let result: Val[] | null = null;
    while (this.i < this.end) {
      const tk = this.t[this.i];
      if (isName(tk, "local")) {
        this.i++;
        this.parseLocal();
      } else if (isName(tk, "return")) {
        this.i++;
        result = this.parseReturn() ?? result;
      } else if (isName(tk, "if", "for", "while", "do", "repeat", "function")) {
        this.skipBlock(); // conditional branches aren't the base case
      } else {
        this.i++;
      }
    }
    return result;
  }

  private skipBlock() {
    // `for`/`while` only open their block at `do`, so keep going until something has opened and closed.
    let depth = 0;
    let opened = false;
    while (this.i < this.end) {
      const tk = this.t[this.i++];
      if (isName(tk, ...BLOCK_OPENERS)) {
        depth++;
        opened = true;
      } else if (isName(tk, ...BLOCK_CLOSERS)) depth--;
      if (opened && depth === 0) return;
    }
  }

  private skipBalanced(open: string, close: string) {
    let depth = 0;
    do {
      const tk = this.t[this.i++];
      if (isSym(tk, open)) depth++;
      else if (isSym(tk, close)) depth--;
    } while (depth > 0 && this.i < this.end);
  }

  private parseLocal() {
    if (isName(this.t[this.i], "function")) return this.skipBlock();
    const names: string[] = [];
    while (this.t[this.i]?.type === "name") {
      names.push(this.t[this.i++].value as string);
      if (!isSym(this.t[this.i], ",")) break;
      this.i++;
    }
    if (!isSym(this.t[this.i], "=")) return;
    this.i++;

    const values: Val[] = [];
    for (;;) {
      const results = this.parseExpr();
      if (isSym(this.t[this.i], ",")) {
        values.push(results[0]);
        this.i++;
      } else {
        values.push(...results); // the last expression expands multiple returns
        break;
      }
    }
    names.forEach((name, n) => this.locals.set(name, values[n] ?? unknown()));
  }

  private parseReturn(): Val[] | null {
    if (!isSym(this.t[this.i], "{")) return null;
    this.i++;
    let depth = 1;
    let vars: Val[] | null = null;
    while (depth > 0 && this.i < this.end) {
      const tk = this.t[this.i];
      if (depth === 1 && isName(tk, "vars") && isSym(this.t[this.i + 1], "=") && isSym(this.t[this.i + 2], "{")) {
        this.i += 3;
        vars = this.parseItems();
        continue;
      }
      if (isSym(tk, "{")) depth++;
      else if (isSym(tk, "}")) depth--;
      this.i++;
    }
    return vars;
  }

  /** Table items after `{`, consuming the closing `}`. */
  private parseItems(): Val[] {
    const items: Val[] = [];
    while (this.i < this.end && !isSym(this.t[this.i], "}")) {
      const results = this.parseExpr();
      if (isSym(this.t[this.i], "}")) items.push(...results);
      else items.push(results[0]);
      if (isSym(this.t[this.i], ",", ";")) this.i++;
      else if (!isSym(this.t[this.i], "}")) this.i++; // unexpected token, recover
    }
    this.i++;
    return items;
  }

  // Expressions, by Lua precedence. Each level returns a list so calls can return several values.

  private parseExpr(): Val[] {
    return this.parseBinary(0);
  }

  private static LEVELS: string[][] = [
    ["or"],
    ["and"],
    ["<", ">", "<=", ">=", "~=", "=="],
    [".."],
    ["+", "-"],
    ["*", "/", "//", "%"],
  ];

  private parseBinary(level: number): Val[] {
    if (level >= Evaluator.LEVELS.length) return this.parseUnary();
    let left = this.parseBinary(level + 1);
    for (;;) {
      const tk = this.t[this.i];
      const op = tk && Evaluator.LEVELS[level].includes(tk.value as string) ? (tk.value as string) : null;
      if (!op || (tk.type === "string" || tk.type === "number")) return left;
      this.i++;
      const right = this.parseBinary(level + 1)[0];
      left = [this.binary(op, left[0], right)];
    }
  }

  private binary(op: string, a: Val, b: Val): Val {
    if (typeof a.v !== "number" || typeof b.v !== "number") return unknown(a, b);
    const x = a.v;
    const y = b.v;
    const result: Record<string, number> = {
      "+": x + y,
      "-": x - y,
      "*": x * y,
      "/": x / y,
      "//": Math.floor(x / y),
      "%": x - Math.floor(x / y) * y,
    };
    return op in result ? val(result[op], a, b) : unknown(a, b);
  }

  private parseUnary(): Val[] {
    const tk = this.t[this.i];
    if (isSym(tk, "-")) {
      this.i++;
      const v = this.parseUnary()[0];
      return [typeof v.v === "number" ? val(-v.v, v) : unknown(v)];
    }
    if (isSym(tk, "#") || isName(tk, "not")) {
      this.i++;
      return [unknown(this.parseUnary()[0])];
    }
    const base = this.parsePrimary();
    if (isSym(this.t[this.i], "^")) {
      this.i++;
      const exp = this.parseUnary()[0];
      return [typeof base[0].v === "number" && typeof exp.v === "number" ? val(base[0].v ** exp.v, base[0], exp) : unknown(base[0], exp)];
    }
    return base;
  }

  private parsePrimary(): Val[] {
    const tk = this.t[this.i];
    if (!tk) return [unknown()];
    if (tk.type === "number" || tk.type === "string") {
      this.i++;
      return [val(tk.value)];
    }
    if (isName(tk, "true", "false")) {
      this.i++;
      return [val(tk.value === "true")];
    }
    if (isName(tk, "nil")) {
      this.i++;
      return [unknown()];
    }
    if (isName(tk, "function")) {
      this.skipBlock();
      return [unknown()];
    }
    if (isSym(tk, "{")) {
      this.skipBalanced("{", "}");
      return [unknown()];
    }
    if (isSym(tk, "(")) {
      this.i++;
      const inner = this.parseExpr()[0];
      if (isSym(this.t[this.i], ")")) this.i++;
      return [inner];
    }
    if (tk.type === "name") return this.parseSuffixed();
    this.i++;
    return [unknown()];
  }

  /** `a.b.c`, `a[b]`, `f(x)`, `obj:method(x)` … */
  private parseSuffixed(): Val[] {
    let path: string[] | null = [this.t[this.i++].value as string];
    let current: Val[] | null = null; // set once the chain can no longer be resolved by path
    const used: Val[] = [];

    for (;;) {
      const tk = this.t[this.i];
      if (isSym(tk, ".") && this.t[this.i + 1]?.type === "name") {
        path?.push(this.t[this.i + 1].value as string);
        this.i += 2;
      } else if (isSym(tk, "[")) {
        this.i++;
        used.push(this.parseExpr()[0]);
        if (isSym(this.t[this.i], "]")) this.i++;
        path = null;
      } else if (isSym(tk, ":") && this.t[this.i + 1]?.type === "name") {
        this.i += 2;
        used.push(...this.parseArgs());
        path = null;
      } else if (isSym(tk, "(", "{") || tk?.type === "string") {
        const args = this.parseArgs();
        current = path ? this.call(path, args) : [unknown(...args)];
        path = null;
      } else {
        break;
      }
    }

    if (current) return used.length ? [unknown(...current, ...used)] : current;
    return [path ? this.resolve(path) : unknown(...used)];
  }

  private parseArgs(): Val[] {
    const tk = this.t[this.i];
    if (tk?.type === "string") {
      this.i++;
      return [val(tk.value)];
    }
    if (isSym(tk, "{")) {
      this.skipBalanced("{", "}");
      return [unknown()];
    }
    if (!isSym(tk, "(")) return [];
    this.i++;
    const args: Val[] = [];
    while (this.i < this.end && !isSym(this.t[this.i], ")")) {
      args.push(this.parseExpr()[0]);
      if (isSym(this.t[this.i], ",")) this.i++;
      else if (!isSym(this.t[this.i], ")")) this.i++;
    }
    this.i++;
    return args;
  }

  private resolve(path: string[]): Val {
    const [head, ...rest] = path;
    const local = this.locals.get(head);
    let base: Val | null = null;
    let fields = rest;

    if (local) {
      base = local;
    } else if ((head === "card" && rest[0] === "ability") || (head === "self" && rest[0] === "config")) {
      if (rest[1] !== "extra") return unknown();
      base = val(EXTRA);
      fields = rest.slice(2);
    }

    if (!base) return unknown();
    if (fields.length === 0) return base;
    if (base.v === EXTRA && fields.length === 1) {
      const raw = this.extra[fields[0]];
      const v = typeof raw === "number" || typeof raw === "string" || typeof raw === "boolean" ? raw : undefined;
      return { v, f: new Set([fields[0]]) };
    }
    return unknown(base);
  }

  private call(path: string[], args: Val[]): Val[] {
    const name = path.join(".");
    if (path[0] === "math" && path.length === 2 && MATH[path[1]]) {
      const nums = args.map((a) => a.v);
      return [nums.length && nums.every((n) => typeof n === "number") ? val(MATH[path[1]](...(nums as number[])), ...args) : unknown(...args)];
    }
    if (name === "SMODS.get_probability_vars") {
      // (card, base_numerator, base_denominator, identifier) -> numerator, denominator
      return [args[1] ?? unknown(), args[2] ?? unknown()];
    }
    return [unknown(...args)];
  }
}

/**
 * Config fields that a file's code assigns to after creation. Scans the whole file,
 * since helpers outside the definition (e.g. Audience's update function) can change them.
 */
export function mutatedFields(src: string): Set<string> {
  return new Set([...src.matchAll(/\bextra\.(\w+)\s*=(?!=)/g)].map((m) => m[1]));
}

/**
 * Resolves the starting values of `#n#` variables from one definition's `loc_vars`
 * (`tokens` are that definition's table, so files with several definitions work).
 * Returns one entry per variable; `null` where the value can't be determined.
 */
export function resolveLocVars(tokens: Token[], extra: Record<string, LuaValue>, mutated: Set<string>): (TextVar | null)[] {
  const start = tokens.findIndex(
    (t, i) => isName(t, "loc_vars") && isSym(tokens[i + 1], "=") && isName(tokens[i + 2], "function"),
  );
  if (start === -1) return [];

  // Body runs from after the parameter list to the matching `end`.
  let i = start + 3;
  while (i < tokens.length && !isSym(tokens[i], ")")) i++;
  const bodyStart = i + 1;
  let depth = 1;
  for (i = bodyStart; i < tokens.length && depth > 0; i++) {
    if (isName(tokens[i], ...BLOCK_OPENERS)) depth++;
    else if (isName(tokens[i], ...BLOCK_CLOSERS)) depth--;
  }

  const vars = new Evaluator(tokens, bodyStart, i - 1, extra).run() ?? [];
  return vars.map(({ v, f }) =>
    typeof v === "number" || typeof v === "string" ? { value: v, dynamic: [...f].some((field) => mutated.has(field)) } : null,
  );
}
