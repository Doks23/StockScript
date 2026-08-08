"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";

export type Filters = {
  symbol: string;
  from: string;
  to: string;
  status: string;
  reviewed: string;
  hideAmounts: boolean;
};

export const DEFAULT_JOURNAL_FILTERS: Filters = {
  symbol: "",
  from: "",
  to: "",
  status: "OPEN",
  reviewed: "ALL",
  hideAmounts: false,
};

const STORAGE_KEY = "journalFilters";
const STATUS_VALUES = ["OPEN", "CLOSED", "ALL"];
const REVIEWED_VALUES = ["ALL", "REVIEWED", "UNREVIEWED"];

// Anything could be sitting in storage - an older shape, a hand-edited value -
// so every field is checked rather than trusted.
function parseSavedFilters(raw: string): Filters {
  const saved = JSON.parse(raw) as Partial<Filters>;
  const str = (value: unknown) => (typeof value === "string" ? value : "");
  return {
    symbol: str(saved.symbol),
    from: str(saved.from),
    to: str(saved.to),
    status: STATUS_VALUES.includes(str(saved.status))
      ? str(saved.status)
      : DEFAULT_JOURNAL_FILTERS.status,
    reviewed: REVIEWED_VALUES.includes(str(saved.reviewed))
      ? str(saved.reviewed)
      : DEFAULT_JOURNAL_FILTERS.reviewed,
    hideAmounts: saved.hideAmounts === true,
  };
}

/**
 * Filter state for both journals, remembered across visits.
 *
 * Storage is read after mount rather than during render, so the server and the
 * first client render agree; `restored` lets the page hold its first fetch until
 * then instead of loading the default view and immediately reloading the saved
 * one. Refresh calls `reset` to get back to the default "Open" view.
 */
export function useJournalFilters() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_JOURNAL_FILTERS);
  const [restored, setRestored] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setFilters(parseSavedFilters(saved));
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  }, [filters, restored]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const change = useCallback((update: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...update }));
  }, []);

  const changeDebounced = useCallback((update: Partial<Filters>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, ...update }));
    }, 380);
  }, []);

  // A fresh object every time, so a refresh from an already-default view still
  // counts as a change and reloads the journal. Dropping the pending debounce
  // matters too: a half-typed search must not land after the reset.
  const reset = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setFilters({ ...DEFAULT_JOURNAL_FILTERS });
    setResetToken((token) => token + 1);
  }, []);

  return { filters, restored, resetToken, change, changeDebounced, reset };
}

type JournalFiltersProps = {
  values: Filters;
  onChange: (update: Partial<Filters>) => void;
  onDebouncedChange: (update: Partial<Filters>) => void;
  /** Bumped by `useJournalFilters().reset`; forces the search box to follow. */
  resetToken?: number;
};

export function JournalFilters({
  values,
  onChange,
  onDebouncedChange,
  resetToken = 0,
}: JournalFiltersProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // The search box shows what is being typed, while `values.symbol` only catches
  // up once the debounce upstream fires. So the draft leads while typing, and
  // follows whenever the value moves on its own - restored filters, or a Refresh
  // reset - rather than pinning the box to stale text.
  const [symbolDraft, setSymbolDraft] = useState(values.symbol);
  const [seen, setSeen] = useState({ symbol: values.symbol, resetToken });
  const typing = useRef(false);

  if (seen.symbol !== values.symbol || seen.resetToken !== resetToken) {
    // A reset overrules a keystroke that has not been reported yet.
    if (seen.resetToken !== resetToken) typing.current = false;
    setSeen({ symbol: values.symbol, resetToken });
    if (values.symbol === symbolDraft) typing.current = false;
    else if (!typing.current) setSymbolDraft(values.symbol);
  }

  const onSymbolInput = (value: string) => {
    typing.current = true;
    setSymbolDraft(value);
    onDebouncedChange({ symbol: value });
  };

  const activeCount =
    (values.from ? 1 : 0) +
    (values.to ? 1 : 0) +
    (values.status !== "OPEN" ? 1 : 0) +
    (values.reviewed !== "ALL" ? 1 : 0) +
    (values.hideAmounts ? 1 : 0);

  return (
    <>
      {/* Mobile compact bar: search + status pills + filter sheet trigger */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:hidden">
        <input
          value={symbolDraft}
          placeholder="Search…"
          className="journal-input h-9 min-w-0 flex-1 px-2.5"
          onChange={(e) => onSymbolInput(e.target.value)}
        />
        <div className="flex shrink-0 items-center gap-0.5 rounded-full border border-line bg-canvas p-0.5">
          {["OPEN", "CLOSED", "ALL"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ status: s })}
              className={`rounded-full px-2 py-1 text-[10px] font-medium transition ${
                values.status === s
                  ? "bg-white text-ink shadow-sm"
                  : "text-slate-500"
              }`}
            >
              {s === "OPEN" ? "Open" : s === "CLOSED" ? "Closed" : "All"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="relative shrink-0 rounded-full border border-line bg-white p-1.5 text-slate-600"
          aria-label="More filters"
        >
          <SlidersHorizontal size={15} />
          {activeCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-semibold text-white">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Desktop bar - deliberately nowrap and compact so the whole ribbon,
          actions included, stays on a single line. */}
      <div className="hidden shrink-0 flex-nowrap items-center gap-1.5 sm:flex">
        <input
          value={symbolDraft}
          placeholder="Search…"
          className="journal-input journal-input-sm w-[94px] shrink-0"
          onChange={(e) => onSymbolInput(e.target.value)}
        />

        <input
          type="date"
          value={values.from}
          title="From date"
          className="journal-input journal-input-sm shrink-0"
          onChange={(e) => onChange({ from: e.target.value })}
        />
        <span className="shrink-0 text-[11px] text-slate-400">–</span>
        <input
          type="date"
          value={values.to}
          title="To date"
          className="journal-input journal-input-sm shrink-0"
          onChange={(e) => onChange({ to: e.target.value })}
        />

        {/* Segmented pills rather than radios: same choice, half the width. */}
        <div className="flex h-8 shrink-0 items-center gap-0.5 rounded-lg border border-line bg-canvas px-0.5">
          {["OPEN", "CLOSED", "ALL"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange({ status: s })}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                values.status === s
                  ? "bg-white text-ink shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {s === "OPEN" ? "Open" : s === "CLOSED" ? "Closed" : "All"}
            </button>
          ))}
        </div>

        <select
          value={values.reviewed}
          onChange={(e) => onChange({ reviewed: e.target.value })}
          title="Reviewed filter"
          className="journal-input journal-input-sm shrink-0 text-slate-600"
        >
          <option value="ALL">Reviewed: All</option>
          <option value="REVIEWED">Reviewed</option>
          <option value="UNREVIEWED">Unreviewed</option>
        </select>

        <label className="inline-flex shrink-0 cursor-pointer select-none items-center gap-1 text-[11px] font-medium text-slate-600">
          <input
            type="checkbox"
            checked={values.hideAmounts}
            className="h-3.5 w-3.5 rounded border-slate-300 accent-slate-700"
            onChange={(e) => onChange({ hideAmounts: e.target.checked })}
          />
          Hide ₹
        </label>
      </div>

      {/* Mobile filter sheet */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40 sm:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-white p-5 shadow-2xl sm:hidden"
            style={{
              paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))",
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-ink">
                Filters
              </h3>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">
                    From
                  </span>
                  <input
                    type="date"
                    value={values.from}
                    className="journal-input w-full"
                    onChange={(e) => onChange({ from: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">
                    To
                  </span>
                  <input
                    type="date"
                    value={values.to}
                    className="journal-input w-full"
                    onChange={(e) => onChange({ to: e.target.value })}
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-400">
                  Reviewed
                </span>
                <select
                  value={values.reviewed}
                  onChange={(e) => onChange({ reviewed: e.target.value })}
                  className="journal-input w-full"
                >
                  <option value="ALL">All</option>
                  <option value="REVIEWED">Reviewed only</option>
                  <option value="UNREVIEWED">Unreviewed only</option>
                </select>
              </label>

              <label className="flex items-center justify-between rounded-2xl border border-line bg-canvas px-4 py-3 text-sm font-medium text-slate-700">
                <span>Hide ₹ amounts</span>
                <input
                  type="checkbox"
                  checked={values.hideAmounts}
                  className="h-5 w-5 rounded border-slate-300 accent-accent"
                  onChange={(e) => onChange({ hideAmounts: e.target.checked })}
                />
              </label>

              <button
                type="button"
                onClick={() => onChange({ ...DEFAULT_JOURNAL_FILTERS })}
                className="w-full rounded-2xl border border-line px-4 py-2.5 text-sm font-medium text-slate-600"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-medium text-white"
              >
                Apply
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
