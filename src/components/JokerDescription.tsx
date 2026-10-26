import type { ReactNode } from "react";

// Balatro markup: `{C:mult}text{}` styles text, `{X:mult,C:white}` draws a filled box,
// `{}` resets, and `#1#` is a value filled in by the game at runtime.
const TOKEN = /\{([^}]*)\}|#(\d+)#/g;

function classFor(style: string) {
  const parts = Object.fromEntries(
    style
      .split(",")
      .map((p) => p.split(":"))
      .filter((p) => p.length === 2),
  );
  if (parts.X) return "bg-foreground text-background px-1 font-semibold";
  if (parts.C === "inactive") return "text-muted italic";
  if (parts.C) return "font-semibold";
  return "";
}

function renderLine(line: string, vars: (string | number)[]) {
  const nodes: ReactNode[] = [];
  let style = "";
  let last = 0;
  let key = 0;

  const pushText = (text: string) => {
    if (!text) return;
    const className = classFor(style);
    nodes.push(className ? <span key={key++} className={className}>{text}</span> : text);
  };

  for (const match of line.matchAll(TOKEN)) {
    pushText(line.slice(last, match.index));
    last = match.index + match[0].length;

    if (match[1] !== undefined) {
      style = match[1];
    } else {
      const value = vars[Number(match[2]) - 1];
      nodes.push(
        value !== undefined ? (
          <span key={key++} className={classFor(style) || "font-semibold"}>
            {value}
          </span>
        ) : (
          <span
            key={key++}
            title="Calculated in game"
            className="mx-0.5 inline-block border border-dashed border-current px-1 font-mono text-[0.85em] leading-tight"
          >
            <span aria-hidden="true">?</span>
            <span className="sr-only">(value calculated in game)</span>
          </span>
        ),
      );
    }
  }
  pushText(line.slice(last));
  return nodes;
}

export function JokerDescription({
  text,
  vars = [],
  className = "",
}: {
  text: string[];
  vars?: (string | number)[];
  className?: string;
}) {
  if (!text.length) return <p className={`text-muted italic ${className}`}>No description available.</p>;

  return (
    <p className={className}>
      {text.map((line, i) => (
        <span key={i} className="block">
          {renderLine(line, vars)}
        </span>
      ))}
    </p>
  );
}
