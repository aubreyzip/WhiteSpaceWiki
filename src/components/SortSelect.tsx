"use client";

import { ChevronDown } from "lucide-react";
import type { SortOption, SortOrder } from "@/lib/gallery";

/**
 * A native select styled as one "Sort by" control: keyboard, screen readers and the phone's
 * own picker work as usual. The visible label sits inside the box and passes clicks through.
 */
export function SortSelect({
  value,
  options,
  onChange,
  disabled = false,
}: {
  value: SortOrder;
  /** The sort modes offered for the selected category. */
  options: SortOption[];
  onChange: (sort: SortOrder) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative shrink-0 sm:w-84">
      <label
        htmlFor="gallery-sort"
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[0.6875rem] uppercase tracking-[0.15em] text-muted"
      >
        Sort by
      </label>
      <select
        id="gallery-sort"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const option = options.find((o) => o.id === e.target.value);
          if (option) onChange(option.id);
        }}
        className="h-11 w-full cursor-pointer appearance-none border border-foreground bg-background pl-22 pr-10 text-base scheme-light-dark hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-background motion-safe:transition-colors sm:text-sm"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2" />
    </div>
  );
}
