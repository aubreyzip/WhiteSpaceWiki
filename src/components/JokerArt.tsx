import type { CSSProperties } from "react";
import type { JokerSprite } from "@/types/joker";

// Grey "?" cell of the mod's placeholder sheet, served locally from public/images.
const FALLBACK: JokerSprite = {
  url: "/images/placeholder.png",
  sheetWidth: 710,
  sheetHeight: 764,
  cellWidth: 142,
  cellHeight: 190,
  x: 3,
  y: 1,
};

const percent = (offset: number, sheet: number, cell: number) => (sheet > cell ? (offset * 100) / (sheet - cell) : 0);

/** Renders one cell of a Balatro sprite sheet, scaled to the element's width. */
export function JokerArt({ sprite, name, className = "" }: { sprite: JokerSprite | null; name: string; className?: string }) {
  const s = sprite ?? FALLBACK;
  const style: CSSProperties = {
    aspectRatio: `${s.cellWidth} / ${s.cellHeight}`,
    backgroundImage: `url("${s.url}")`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${(s.sheetWidth * 100) / s.cellWidth}% ${(s.sheetHeight * 100) / s.cellHeight}%`,
    backgroundPosition: `${percent(s.x * s.cellWidth, s.sheetWidth, s.cellWidth)}% ${percent(s.y * s.cellHeight, s.sheetHeight, s.cellHeight)}%`,
  };

  return (
    <div
      role="img"
      aria-label={sprite ? `${name} artwork` : `No artwork available for ${name}`}
      className={`pixelated ${className}`}
      style={style}
    />
  );
}
