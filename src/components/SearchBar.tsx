"use client";

import { Search, X } from "lucide-react";

export function SearchBar({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  /** What's being searched, e.g. "Jokers". */
  label: string;
}) {
  return (
    <div className="relative">
      <label htmlFor="gallery-search" className="sr-only">
        Search {label} by name
      </label>
      <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2" />
      <input
        id="gallery-search"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`Search ${label}…`}
        autoComplete="off"
        className="w-full border border-foreground bg-background py-3 pl-11 pr-11 text-base placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-foreground hover:text-background focus-visible:outline-2 focus-visible:outline-foreground"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  );
}
