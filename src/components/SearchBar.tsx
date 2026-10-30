"use client";

import { Search, X } from "lucide-react";

export function SearchBar({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  /** What's being searched, e.g. "Jokers". */
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <label htmlFor="gallery-search" className="sr-only">
        Search {label} by name
      </label>
      <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2" />
      <input
        id="gallery-search"
        type="search"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Search ${label}…`}
        autoComplete="off"
        className="h-11 w-full border border-foreground bg-background pl-10 pr-11 text-base placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      {value && !disabled && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-1 top-1/2 -translate-y-1/2 p-2.5 hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-foreground motion-safe:transition-colors"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  );
}
