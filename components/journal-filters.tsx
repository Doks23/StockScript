"use client";

import { useRef } from "react";

export type Filters = {
  symbol: string;
  from: string;
  to: string;
  status: string;
  hideAmounts: boolean;
};

type JournalFiltersProps = {
  values: Filters;
  onChange: (update: Partial<Filters>) => void;
  onDebouncedChange: (update: Partial<Filters>) => void;
};

export function JournalFilters({ values, onChange, onDebouncedChange }: JournalFiltersProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debounced = (update: Partial<Filters>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onDebouncedChange(update), 380);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        value={values.symbol}
        placeholder="Search symbol…"
        className="journal-input min-w-[140px]"
        onChange={(e) => debounced({ symbol: e.target.value })}
      />

      <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">From</span>
      <input
        type="date"
        value={values.from}
        className="journal-input"
        onChange={(e) => onChange({ from: e.target.value })}
      />
      <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">To</span>
      <input
        type="date"
        value={values.to}
        className="journal-input"
        onChange={(e) => onChange({ to: e.target.value })}
      />

      <div className="flex items-center gap-3 rounded-[8px] border border-line bg-canvas px-3 h-[36px] text-sm text-slate-600 shadow-sm">
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name="status"
            value="ALL"
            checked={values.status === "ALL"}
            onChange={(e) => onChange({ status: e.target.value })}
            className="accent-accent"
          />
          All
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name="status"
            value="OPEN"
            checked={values.status === "OPEN"}
            onChange={(e) => onChange({ status: e.target.value })}
            className="accent-accent"
          />
          Open
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="radio"
            name="status"
            value="CLOSED"
            checked={values.status === "CLOSED"}
            onChange={(e) => onChange({ status: e.target.value })}
            className="accent-accent"
          />
          Closed
        </label>
      </div>

      <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={values.hideAmounts}
          className="h-4 w-4 rounded border-slate-300 accent-slate-700"
          onChange={(e) => onChange({ hideAmounts: e.target.checked })}
        />
        Hide ₹
      </label>
    </div>
  );
}
