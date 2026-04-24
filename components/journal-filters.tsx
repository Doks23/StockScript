"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";

type Filters = {
  symbol: string;
  from: string;
  to: string;
  minQty: string;
  status: string;
  sort: string;
  hideAmounts: boolean;
};

type Defaults = {
  symbol?: string;
  from?: string;
  to?: string;
  minQty?: string;
  status?: string;
  sort?: string;
  hideAmounts?: string;
};

export function JournalFilters({ defaults }: { defaults: Defaults }) {
  const router = useRouter();
  const pathname = usePathname();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [filters, setFilters] = useState<Filters>({
    symbol: defaults.symbol ?? "",
    from: defaults.from ?? "",
    to: defaults.to ?? "",
    minQty: defaults.minQty ?? "",
    status: defaults.status ?? "OPEN",
    sort: defaults.sort ?? "DESC",
    hideAmounts: defaults.hideAmounts === "1",
  });

  const pushUrl = useCallback(
    (f: Filters) => {
      const sp = new URLSearchParams();
      if (f.symbol) sp.set("symbol", f.symbol);
      if (f.from) sp.set("from", f.from);
      if (f.to) sp.set("to", f.to);
      if (f.minQty) sp.set("minQty", f.minQty);
      sp.set("status", f.status);
      sp.set("sort", f.sort);
      if (f.hideAmounts) sp.set("hideAmounts", "1");
      router.push(`${pathname}?${sp.toString()}`);
    },
    [router, pathname]
  );

  const immediate = (update: Partial<Filters>) => {
    const next = { ...filters, ...update };
    setFilters(next);
    pushUrl(next);
  };

  const debounced = (update: Partial<Filters>) => {
    const next = { ...filters, ...update };
    setFilters(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => pushUrl(next), 380);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        value={filters.symbol}
        placeholder="Search symbol…"
        className="journal-input min-w-[140px]"
        onChange={(e) => debounced({ symbol: e.target.value })}
      />

      <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">From</span>
      <input
        type="date"
        value={filters.from}
        className="journal-input"
        onChange={(e) => immediate({ from: e.target.value })}
      />
      <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">To</span>
      <input
        type="date"
        value={filters.to}
        className="journal-input"
        onChange={(e) => immediate({ to: e.target.value })}
      />

      <input
        value={filters.minQty}
        placeholder="Min Qty"
        className="journal-input w-[90px]"
        onChange={(e) => debounced({ minQty: e.target.value })}
      />

      <select
        value={filters.status}
        className="journal-input"
        onChange={(e) => immediate({ status: e.target.value })}
      >
        <option value="ALL">All Trades</option>
        <option value="OPEN">Open Only</option>
        <option value="CLOSED">Closed Only</option>
      </select>

      <select
        value={filters.sort}
        className="journal-input"
        onChange={(e) => immediate({ sort: e.target.value })}
      >
        <option value="DESC">Newest First</option>
        <option value="ASC">Oldest First</option>
      </select>

      <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={filters.hideAmounts}
          className="h-4 w-4 rounded border-slate-300 accent-slate-700"
          onChange={(e) => immediate({ hideAmounts: e.target.checked })}
        />
        Hide ₹
      </label>
    </div>
  );
}
