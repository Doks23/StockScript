"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { JournalFilters, useJournalFilters } from "@/components/journal-filters";
import type { Filters } from "@/components/journal-filters";
import { JournalMetricsBar } from "@/components/journal-metrics";
import type { JournalMetrics } from "@/components/journal-metrics";
import {
  SimpleJournalTable,
  SIMPLE_JOURNAL_FONT_DEFAULT,
} from "@/components/simple-journal-table";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import type { GroupedTradeRow } from "@/lib/trade-utils";

type SearchResult = {
  trades: GroupedTradeRow[];
  totalCount: number;
  totalPages: number;
  page: number;
  pageSize: number;
  metrics: JournalMetrics;
};

const FONT_KEY = "simpleJournalFontSize";
const FONT_MIN = 11;
const FONT_MAX = 18;

function SimpleJournalContent() {
  const [data, setData] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const {
    filters,
    restored: filtersRestored,
    resetToken,
    change: onFilterChange,
    changeDebounced: onFilterDebounced,
    reset: resetFilters,
  } = useJournalFilters();
  const [page, setPage] = useState(1);
  const [fontPx, setFontPx] = useState(SIMPLE_JOURNAL_FONT_DEFAULT);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(FONT_KEY));
    if (Number.isFinite(saved) && saved >= FONT_MIN && saved <= FONT_MAX) {
      setFontPx(saved);
    }
  }, []);

  const changeFont = useCallback((delta: number) => {
    setFontPx((prev) => {
      const next = Math.min(FONT_MAX, Math.max(FONT_MIN, prev + delta));
      window.localStorage.setItem(FONT_KEY, String(next));
      return next;
    });
  }, []);

  const fetchData = useCallback(async (f: Filters, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams();
      if (f.symbol) sp.set("symbol", f.symbol);
      if (f.from) sp.set("from", f.from);
      if (f.to) sp.set("to", f.to);
      sp.set("status", f.status);
      if (f.reviewed !== "ALL") sp.set("reviewed", f.reviewed);
      if (f.avoidable !== "ALL") sp.set("avoidable", f.avoidable);
      sp.set("page", String(p));
      sp.set("pageSize", "50");

      const res = await fetch(`/api/trades/search?${sp.toString()}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to fetch trades");
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Held until the saved filters are back, so the remembered view loads once.
    if (!filtersRestored) return;
    fetchData(filters, page);
  }, [filters, filtersRestored, page, fetchData]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  // Same deal as the full journal: Refresh reloads and drops any remembered
  // filters back to the default "Open" view.
  const handleRefresh = useCallback(() => {
    setPage(1);
    resetFilters();
  }, [resetFilters]);

  const metrics = data?.metrics;
  const totalPages = data?.totalPages || 1;

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/trades"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Full Journal
        </Link>
        <h1 className="text-lg font-bold text-ink">Simple Journal</h1>
      </div>

      <section className="rounded-2xl border border-line bg-panel px-2.5 py-2 shadow-sm sm:px-5 sm:py-3">
        <div className="flex items-center gap-1.5 sm:gap-2 sm:overflow-x-auto lg:overflow-visible">
          <JournalFilters
            values={filters}
            onChange={onFilterChange}
            onDebouncedChange={onFilterDebounced}
            resetToken={resetToken}
          />
          <div className="flex shrink-0 items-center gap-1.5 sm:ml-auto">
            <div className="flex h-8 shrink-0 items-center rounded-lg border border-line bg-white">
              <button
                type="button"
                onClick={() => changeFont(-1)}
                disabled={fontPx <= FONT_MIN}
                data-tip="Smaller text"
                aria-label="Smaller text"
                className="tip h-full rounded-l-lg px-2 text-[11px] font-semibold text-slate-600 transition hover:bg-canvas disabled:opacity-30"
              >
                A−
              </button>
              <span className="w-6 text-center text-[10px] tabular-nums text-slate-400">
                {fontPx}
              </span>
              <button
                type="button"
                onClick={() => changeFont(1)}
                disabled={fontPx >= FONT_MAX}
                data-tip="Larger text"
                aria-label="Larger text"
                className="tip h-full rounded-r-lg px-2 text-[13px] font-semibold text-slate-600 transition hover:bg-canvas disabled:opacity-30"
              >
                A+
              </button>
            </div>
            <button
              onClick={handleRefresh}
              disabled={loading}
              data-tip="Reload and clear filters"
              aria-label="Refresh"
              className="tip flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-white px-1.5 text-[11px] text-slate-600 transition hover:bg-canvas disabled:opacity-50 sm:rounded-lg sm:px-2.5"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              <span className="hidden xl:inline">Refresh</span>
            </button>
          </div>
        </div>
      </section>

      {metrics && (
        <JournalMetricsBar metrics={metrics} showAmounts={!filters.hideAmounts} />
      )}

      {loading && !data && (
        <div className="text-center py-12 text-slate-400 text-sm">Loading trades…</div>
      )}
      {error && (
        <div className="text-center py-12 text-red-500 text-sm">{error}</div>
      )}

      {data && (
        <section className="overflow-hidden rounded-2xl border border-line bg-panel p-2 shadow-sm sm:p-3">
          <SimpleJournalTable
            rows={data.trades}
            showAmounts={!filters.hideAmounts}
            fontPx={fontPx}
          />
        </section>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 py-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-4 py-1.5 rounded-lg border border-line text-sm font-medium text-slate-600 hover:bg-canvas transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <span className="text-sm text-slate-500">
            Page {page} of {totalPages} ({data?.totalCount ?? 0} trades)
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-4 py-1.5 rounded-lg border border-line text-sm font-medium text-slate-600 hover:bg-canvas transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

export default function SimpleJournalPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-slate-400 text-sm">Loading page…</div>}>
      <SimpleJournalContent />
    </Suspense>
  );
}
