import type { CSSProperties } from "react";
import type { Sprite } from "@/types/content";

// The mod's placeholder sheet, served locally from public/images; each category picks its own cell.
const PLACEHOLDER_SHEET = {
  url: "/images/placeholder.png",
  sheetWidth: 710,
  sheetHeight: 764,
  cellWidth: 142,
  cellHeight: 190,
};

const percent = (offset: number, sheet: number, cell: number) => (sheet > cell ? (offset * 100) / (sheet - cell) : 0);

/** Renders one cell of a Balatro sprite sheet, scaled to the element's width. */
export function CardArt({
  sprite,
  name,
  fallbackCell,
  className = "",
}: {
  sprite: Sprite | null;
  name: string;
  /** Placeholder cell shown when the item has no artwork. */
  fallbackCell: { x: number; y: number };
  className?: string;
}) {
  const s = sprite ?? { ...PLACEHOLDER_SHEET, ...fallbackCell };
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
