"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { CheckCircle2, Download, RefreshCw, X, Table2, CloudDownload, Zap } from "lucide-react";
import { DhanSync } from "@/components/dhan-sync";
import { DhanTodaySync } from "@/components/dhan-today-sync";
import { JournalTable } from "@/components/journal-table";
import { JournalFilters, useJournalFilters } from "@/components/journal-filters";
import type { Filters } from "@/components/journal-filters";
import { JournalMetricsBar } from "@/components/journal-metrics";
import type { JournalMetrics } from "@/components/journal-metrics";
import {
  EodPriceSyncPanel,
  EodPriceSyncTrigger,
  useEodPriceSync,
} from "@/components/eod-price-sync";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { GroupedTradeRow } from "@/lib/trade-utils";

type SortKey =
  | "symbol"
  | "entryDate"
  | "exitDate"
  | "openCapital"
  | "stopLossPct"
  | "allocationPct"
  | "ageDays"
  | "avgEntryPrice"
  | "pnlPct"
  | "pnlAmount"
  | "impactPct";

type SearchResult = {
  trades: GroupedTradeRow[];
  totalCount: number;
  totalPages: number;
  page: number;
  pageSize: number;
  metrics: JournalMetrics;
};

type Competition = { id: string; name: string };

function TradesPageContent({ competitions }: { competitions: Competition[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [toast, setToast] = useState("");
  const [dhanOpen, setDhanOpen] = useState(false);
  const [todayOpen, setTodayOpen] = useState(false);

  useEffect(() => {
    const saved = searchParams.get("saved");
    if (saved === "created" || saved === "updated") {
      setToast(saved === "created" ? "Trade created." : "Trade updated.");
      const timer = setTimeout(() => setToast(""), 3500);
      router.replace("/trades", { scroll: false });
      return () => clearTimeout(timer);
    }

    // Set by an import that ran on the full entry page and sent us back here.
    const imported = searchParams.get("imported");
    if (imported !== null) {
      const count = Number(imported);
      setToast(
        Number.isFinite(count)
          ? `Imported ${count} trade${count === 1 ? "" : "s"} from Dhan.`
          : "Imported trades from Dhan.",
      );
      const timer = setTimeout(() => setToast(""), 3500);
      router.replace("/trades", { scroll: false });
      return () => clearTimeout(timer);
    }
  }, [router, searchParams]);

  const fetchData = useCallback(async (f: Filters, p: number, sk: SortKey | null, sd: "asc" | "desc") => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams();
      if (f.symbol) sp.set("symbol", f.symbol);
      if (f.from) sp.set("from", f.from);
      if (f.to) sp.set("to", f.to);
      sp.set("status", f.status);
      if (f.reviewed !== "ALL") sp.set("reviewed", f.reviewed);
      sp.set("page", String(p));
      sp.set("pageSize", "50");
      if (sk) {
        sp.set("sortKey", sk);
        sp.set("sortDir", sd);
      }

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
  }, [sortKey, sortDir]);

  useEffect(() => {
    // Waits for the saved filters, so the journal loads the remembered view once
    // rather than the default view followed by the remembered one.
    if (!filtersRestored) return;
    fetchData(filters, page, sortKey, sortDir);
  }, [filters, filtersRestored, page, sortKey, sortDir, fetchData]);

  // Held here rather than inside one component because the trigger sits in the
  // ribbon and the results table renders further down the page.
  const eodSync = useEodPriceSync(() => fetchData(filters, page, sortKey, sortDir));

  useEffect(() => {
    setPage(1);
  }, [filters]);

  // Refresh doubles as the way out of a filter set that is remembered from an
  // earlier visit: back to page one of the default "Open" journal.
  const handleRefresh = useCallback(() => {
    setPage(1);
    resetFilters();
  }, [resetFilters]);

  const handleDownload = useCallback(() => {
    const sp = new URLSearchParams();
    if (filters.symbol) sp.set("symbol", filters.symbol);
    if (filters.from) sp.set("from", filters.from);
    if (filters.to) sp.set("to", filters.to);
    sp.set("status", filters.status);
    const a = document.createElement("a");
    a.href = `/api/trades/export?${sp.toString()}`;
    a.click();
  }, [filters]);

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortDir("desc");
      }
      return key;
    });
    setPage(1);
  }, []);

  // Escape closes the sync dialog, and the journal behind it stays put rather
  // than scrolling under a form that is taller than the viewport.
  useEffect(() => {
    if (!dhanOpen && !todayOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setDhanOpen(false);
      setTodayOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [dhanOpen, todayOpen]);

  const metrics = data?.metrics;
  const totalPages = data?.totalPages || 1;

  return (
    <div className="space-y-3 sm:space-y-4">
      {toast && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/10 px-4 pt-24 backdrop-blur-[1px]">
          <div
            role="status"
            aria-live="polite"
            className="w-full max-w-sm rounded-2xl border border-profit/20 bg-white p-4 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-profit/10 text-profit">
                <CheckCircle2 size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{toast}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Your journal has been updated.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setToast("")}
                className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close confirmation"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {dhanOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Sync from Dhan"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDhanOpen(false);
          }}
          className="fixed inset-0 z-50 overflow-y-auto bg-ink/40 p-3 backdrop-blur-[1px] sm:p-6"
        >
          <div className="mx-auto w-full max-w-2xl">
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setDhanOpen(false)}
                aria-label="Close"
                className="rounded-full bg-white/90 p-1.5 text-slate-500 shadow-sm transition hover:bg-white hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>
            <DhanSync
              competitions={competitions}
              onImported={(count) => {
                setDhanOpen(false);
                setToast(`Imported ${count} trade${count === 1 ? "" : "s"} from Dhan.`);
                setTimeout(() => setToast(""), 3500);
                fetchData(filters, page, sortKey, sortDir);
              }}
            />
          </div>
        </div>
      )}

      {todayOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Sync today's fills from Dhan"
          onClick={(e) => {
            if (e.target === e.currentTarget) setTodayOpen(false);
          }}
          className="fixed inset-0 z-50 overflow-y-auto bg-ink/40 p-3 backdrop-blur-[1px] sm:p-6"
        >
          <div className="mx-auto w-full max-w-2xl">
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setTodayOpen(false)}
                aria-label="Close"
                className="rounded-full bg-white/90 p-1.5 text-slate-500 shadow-sm transition hover:bg-white hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>
            <DhanTodaySync
              competitions={competitions}
              onApplied={(applied, needsAttention) => {
                // A clean apply has nothing left to read, so the dialog gets out
                // of the way and the toast carries the news; anything with a
                // warning or an unmapped symbol stays up to be read.
                if (!needsAttention) setTodayOpen(false);
                // Charge top-ups report 0 trades but still change the numbers,
                // so the journal reloads either way and only the wording differs.
                if (applied > 0) {
                  setToast(
                    `Today's fills applied to ${applied} trade${applied === 1 ? "" : "s"}.`,
                  );
                  setTimeout(() => setToast(""), 3500);
                }
                fetchData(filters, page, sortKey, sortDir);
              }}
            />
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-line bg-panel px-2.5 py-2 shadow-sm sm:px-3">
        <div className="flex items-center gap-1.5 sm:gap-2 sm:overflow-x-auto lg:overflow-visible">
          <JournalFilters
            values={filters}
            onChange={onFilterChange}
            onDebouncedChange={onFilterDebounced}
            resetToken={resetToken}
          />
          <div className="flex shrink-0 items-center gap-1.5 sm:ml-auto">
            <Link
              href="/trades/simple"
              data-tip="Simple view"
              className="tip flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-white px-1.5 text-[11px] text-slate-600 transition hover:bg-canvas sm:rounded-lg sm:px-2.5"
            >
              <Table2 size={14} />
              <span className="hidden xl:inline">Simple</span>
            </Link>
            <button
              onClick={handleDownload}
              data-tip="Download as CSV"
              className="tip flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-white px-1.5 text-[11px] text-slate-600 transition hover:bg-canvas sm:rounded-lg sm:px-2.5"
              aria-label="Download CSV"
            >
              <Download size={14} />
              <span className="hidden xl:inline">CSV</span>
            </button>
            <button
              onClick={handleRefresh}
              disabled={loading}
              data-tip="Reload and clear filters"
              className="tip flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-white px-1.5 text-[11px] text-slate-600 transition hover:bg-canvas disabled:opacity-50 sm:rounded-lg sm:px-2.5"
              aria-label="Refresh"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              <span className="hidden xl:inline">Refresh</span>
            </button>
            <EodPriceSyncTrigger sync={eodSync} />
            <button
              onClick={() => setTodayOpen(true)}
              data-tip="Sync today's fills from Dhan"
              className="tip flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-accent bg-white px-2.5 text-[11px] font-medium text-accent transition hover:bg-canvas"
            >
              <Zap size={14} />
              <span className="hidden xl:inline">Today</span>
            </button>
            <button
              onClick={() => setDhanOpen(true)}
              data-tip="Sync trades from Dhan"
              className="tip flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-2.5 text-[11px] font-medium text-white transition hover:opacity-90"
            >
              <CloudDownload size={14} />
              <span className="hidden xl:inline">Dhan</span>
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

      <EodPriceSyncPanel sync={eodSync} />

      {data && (
        <section className="overflow-hidden rounded-2xl border border-line bg-panel p-2 shadow-sm sm:p-3">
          <JournalTable rows={data.trades} showAmounts={!filters.hideAmounts} onRefresh={() => fetchData(filters, page, sortKey, sortDir)} showSummary={false} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
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

export function TradesPageClient({
  competitions = [],
}: {
  competitions?: Competition[];
}) {
  return (
    <Suspense fallback={<div className="text-center py-12 text-slate-400 text-sm">Loading page…</div>}>
      <TradesPageContent competitions={competitions} />
    </Suspense>
  );
}
