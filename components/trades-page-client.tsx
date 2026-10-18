"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import {
  CheckCircle2,
  CloudDownload,
  Download,
  RefreshCw,
  ShieldCheck,
  Table2,
  Tag,
  X,
  Zap,
} from "lucide-react";
import { DhanSync } from "@/components/dhan-sync";
import { DhanTodaySync } from "@/components/dhan-today-sync";
import { getSymbolMap, refreshSymbolMap } from "@/components/symbol-chart-link";
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
  const [mappingTickers, setMappingTickers] = useState(false);
  const [slFetching, setSlFetching] = useState(false);
  const slFileInput = useRef<HTMLInputElement>(null);
  const slCsvText = useRef("");
  type SlFetchMatched = {
    tradeId: string;
    symbol: string;
    algoTicker: string;
    date: string;
    qty: number;
    entry: number;
    stopLoss: number;
    stopLossPct: number;
  };
  type SlFetchUnmatched = {
    tradeId: string;
    symbol: string;
    algoTicker: string;
    date: string | null;
    qty: number;
  };
  type SlFetchResult = {
    mode?: "preview" | "apply";
    csvRows: number;
    candidateTrades: number;
    matched: SlFetchMatched[];
    unmatched: SlFetchUnmatched[];
    applied?: number;
    error?: string;
  };
  const [slResult, setSlResult] = useState<SlFetchResult | null>(null);
  const [slSelected, setSlSelected] = useState<Set<string>>(new Set());
  const [slApplying, setSlApplying] = useState(false);

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
      if (f.avoidable !== "ALL") sp.set("avoidable", f.avoidable);
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

  /**
   * Name every row the way TradingView does, from Dhan's security list.
   *
   * The journal falls back to the company name with its spaces stripped when a
   * symbol has no mapping - VATECHWABAG for VA TECH WABAG - which looks like a
   * ticker but charts nothing. This fills the mappings in one pass rather than
   * one prompt at a time.
   */
  const mapTickers = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    setMappingTickers(true);
    try {
      const response = await fetch("/api/symbol-map/backfill", { method: "POST" });
      const data = (await response.json()) as {
        added?: number;
        unmapped?: string[];
        error?: string;
      };

      if (!response.ok) {
        // A silent pass is something the user did not ask for, so a failure
        // stays quiet - the rows keep their fallback name, as before.
        if (!silent) setToast(data.error || "Could not map symbols to TradingView tickers.");
      } else {
        // Written on the server, so the open page is holding a stale map.
        await refreshSymbolMap();
        const unmapped = data.unmapped ?? [];
        // The quiet pass stays quiet when it worked - the rows just rename.
        // It speaks up only when it could map nothing at all, because that is
        // the one outcome the user cannot see and cannot act on otherwise.
        if (silent && !(data.added === 0 && unmapped.length > 0)) return;
        setToast(
          data.added
            ? `Named ${data.added} symbol${data.added === 1 ? "" : "s"} the way TradingView does.` +
                (unmapped.length
                  ? ` ${unmapped.length} still unmapped: ${unmapped.slice(0, 3).join(", ")}${unmapped.length > 3 ? "…" : ""} - click one to set it.`
                  : "")
            : unmapped.length
              ? `Nothing to map automatically. ${unmapped.length} symbol(s) are not in Dhan's list: ${unmapped.slice(0, 3).join(", ")}${unmapped.length > 3 ? "…" : ""}`
              : "Every symbol is already named the way TradingView does.",
        );
      }
    } catch (err) {
      if (!silent) {
        setToast((err as Error).message || "Could not map symbols to TradingView tickers.");
      }
    } finally {
      setMappingTickers(false);
      if (!silent) setTimeout(() => setToast(""), 6000);
    }
  }, []);

  /**
   * Step 1: preview the SL matches from the uploaded algo CSV. The server does the
   * matching (symbol + first-entry IST date + total entry qty) and returns
   * Entry / Qty / SL / SL% per candidate. We show them in a confirm panel
   * with checkboxes; nothing is written until the user clicks Apply.
   */
  const fetchSlFromAlgo = useCallback(async (csvText: string) => {
    slCsvText.current = csvText;
    setSlFetching(true);
    setSlResult(null);
    setSlSelected(new Set());
    try {
      // Pass the current journal filters so Fetch SL only scans the trades
      // the user is actually looking at. The server validates these.
      const res = await fetch("/api/trades/fetch-sl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvText,
          filters: {
            symbol: filters.symbol,
            status: filters.status,
            from: filters.from,
            to: filters.to,
          },
        }),
      });
      const data = (await res.json()) as SlFetchResult;
      if (!res.ok) {
        setSlResult({
          csvRows: 0,
          candidateTrades: 0,
          matched: [],
          unmatched: [],
          error: data.error || "Could not fetch SL from algo.",
        });
      } else {
        setSlResult(data);
        // Preselect every matched row - most of the time the user wants them all.
        setSlSelected(new Set(data.matched.map((m) => m.tradeId)));
      }
    } catch (err) {
      setSlResult({
        csvRows: 0,
        candidateTrades: 0,
        matched: [],
        unmatched: [],
        error: (err as Error).message || "Could not fetch SL from algo.",
      });
    } finally {
      setSlFetching(false);
    }
  }, [filters]);

  /**
   * Step 2: send the checked tradeIds to the same endpoint with apply=true.
   * The server recomputes the matches so the client can't inject arbitrary
   * SL numbers; only the ids the user chose actually get written.
   */
  const onSlFilePicked = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        await fetchSlFromAlgo(await file.text());
      } catch (err) {
        setSlResult({
          csvRows: 0,
          candidateTrades: 0,
          matched: [],
          unmatched: [],
          error: (err as Error).message || "Could not read the CSV file.",
        });
      }
    },
    [fetchSlFromAlgo],
  );

  const applySlFromAlgo = useCallback(async () => {
    if (!slResult || slSelected.size === 0) return;
    setSlApplying(true);
    try {
      const res = await fetch("/api/trades/fetch-sl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apply: true,
          csvText: slCsvText.current,
          tradeIds: Array.from(slSelected),
          filters: {
            symbol: filters.symbol,
            status: filters.status,
            from: filters.from,
            to: filters.to,
          },
        }),
      });
      const data = (await res.json()) as SlFetchResult;
      if (!res.ok) {
        setSlResult((prev) =>
          prev ? { ...prev, error: data.error || "Could not apply SL." } : prev,
        );
      } else {
        setSlResult(data);
        setSlSelected(new Set());
        if ((data.applied ?? 0) > 0) {
          await fetchData(filters, page, sortKey, sortDir);
        }
      }
    } catch (err) {
      setSlResult((prev) =>
        prev
          ? { ...prev, error: (err as Error).message || "Could not apply SL." }
          : prev,
      );
    } finally {
      setSlApplying(false);
    }
  }, [slResult, slSelected, filters, page, sortKey, sortDir, fetchData]);

  const toggleSlRow = useCallback((tradeId: string) => {
    setSlSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tradeId)) next.delete(tradeId);
      else next.add(tradeId);
      return next;
    });
  }, []);

  const toggleAllSlRows = useCallback(() => {
    setSlSelected((prev) => {
      if (!slResult) return prev;
      if (prev.size === slResult.matched.length) return new Set();
      return new Set(slResult.matched.map((m) => m.tradeId));
    });
  }, [slResult]);

  /**
   * Map on sight, once per page.
   *
   * Every symbol Dhan lists can be named from its security list without asking
   * anyone anything, so a row showing VATECHWABAG - the company name with its
   * spaces stripped, which charts nothing - is a mapping nobody has run yet
   * rather than a decision. This runs it the first time such a row is rendered.
   * It is quiet on the way through: only rows whose names change, change.
   */
  const autoMapped = useRef(false);
  useEffect(() => {
    const rows = data?.trades;
    if (autoMapped.current || !rows || rows.length === 0) return;
    autoMapped.current = true;

    void (async () => {
      const map = await getSymbolMap();
      const missing = rows.some((row) => !map[row.symbol.trim().toUpperCase()]);
      if (!missing) return;
      await mapTickers({ silent: true });
    })();
  }, [data, mapTickers]);

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
                // The import backfilled tickers server-side; the page is still
                // holding the map it loaded before them.
                void refreshSymbolMap();
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
                void refreshSymbolMap();
                fetchData(filters, page, sortKey, sortDir);
              }}
            />
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-line bg-panel px-2.5 py-2 shadow-sm sm:px-3">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <JournalFilters
            values={filters}
            onChange={onFilterChange}
            onDebouncedChange={onFilterDebounced}
            resetToken={resetToken}
          />
          <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
            <Link
              href="/trades/simple"
              data-tip="Simple view"
              className="tip flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-white px-1.5 text-[11px] text-slate-600 transition hover:bg-canvas sm:rounded-lg sm:px-2.5"
            >
              <Table2 size={14} />
              <span className="hidden 2xl:inline">Simple</span>
            </Link>
            <button
              onClick={handleDownload}
              data-tip="Download as CSV"
              className="tip flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-white px-1.5 text-[11px] text-slate-600 transition hover:bg-canvas sm:rounded-lg sm:px-2.5"
              aria-label="Download CSV"
            >
              <Download size={14} />
              <span className="hidden 2xl:inline">CSV</span>
            </button>
            <button
              onClick={handleRefresh}
              disabled={loading}
              data-tip="Reload and clear filters"
              className="tip flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-white px-1.5 text-[11px] text-slate-600 transition hover:bg-canvas disabled:opacity-50 sm:rounded-lg sm:px-2.5"
              aria-label="Refresh"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              <span className="hidden 2xl:inline">Refresh</span>
            </button>
            <EodPriceSyncTrigger sync={eodSync} />
            <button
              onClick={() => mapTickers()}
              disabled={mappingTickers}
              data-tip="Name every symbol the way TradingView does"
              className="tip flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-white px-1.5 text-[11px] text-slate-600 transition hover:bg-canvas disabled:opacity-50 sm:rounded-lg sm:px-2.5"
              aria-label="Map symbols to TradingView tickers"
            >
              <Tag size={14} className={mappingTickers ? "animate-pulse" : ""} />
              <span className="hidden 2xl:inline">Tickers</span>
            </button>
            <input
              ref={slFileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={onSlFilePicked}
            />
            <button
              onClick={() => slFileInput.current?.click()}
              disabled={slFetching}
              data-tip="Pick trades_events_latest.csv to backfill initial Stop Loss on empty-SL trades"
              className="tip flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-white px-1.5 text-[11px] text-slate-600 transition hover:bg-canvas disabled:opacity-50 sm:rounded-lg sm:px-2.5"
              aria-label="Fetch SL from algo"
            >
              <ShieldCheck size={14} className={slFetching ? "animate-pulse" : ""} />
              <span className="hidden 2xl:inline">Fetch SL</span>
            </button>
            <button
              onClick={() => setTodayOpen(true)}
              data-tip="Sync today's fills from Dhan"
              className="tip flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-accent bg-white px-2.5 text-[11px] font-medium text-accent transition hover:bg-canvas"
            >
              <Zap size={14} />
              <span className="hidden 2xl:inline">Today</span>
            </button>
            <button
              onClick={() => setDhanOpen(true)}
              data-tip="Sync trades from Dhan"
              className="tip flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-2.5 text-[11px] font-medium text-white transition hover:opacity-90"
            >
              <CloudDownload size={14} />
              <span className="hidden 2xl:inline">Dhan</span>
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

      {slResult && (
        <section
          className={`rounded-2xl border p-4 text-sm shadow-sm ${
            slResult.error ? "border-red-200 bg-red-50" : "border-line bg-white"
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-accent" />
              <span className="font-medium text-ink">
                {slResult.mode === "apply"
                  ? `Applied SL to ${slResult.applied ?? 0} trade${
                      (slResult.applied ?? 0) === 1 ? "" : "s"
                    }`
                  : "Fetch SL from algo - review and apply"}
              </span>
            </div>
            <button
              onClick={() => {
                setSlResult(null);
                setSlSelected(new Set());
              }}
              className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>

          {slResult.error ? (
            <p className="mt-2 text-red-600">{slResult.error}</p>
          ) : (
            <>
              <p className="mt-2 text-slate-600">
                Read <span className="font-semibold text-ink">{slResult.csvRows}</span>{" "}
                stop_placed events. Found{" "}
                <span className="font-semibold text-profit">
                  {slResult.matched.length}
                </span>{" "}
                match{slResult.matched.length === 1 ? "" : "es"} across{" "}
                <span className="font-semibold text-ink">
                  {slResult.candidateTrades}
                </span>{" "}
                empty-SL trade
                {slResult.candidateTrades === 1 ? "" : "s"}. Unmatched{" "}
                <span className="font-semibold text-amber-600">
                  {slResult.unmatched.length}
                </span>
                .
              </p>

              {slResult.matched.length > 0 && (
                <div className="mt-3 overflow-x-auto sticky-head-box rounded-xl border border-line">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-canvas text-[11px] uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="w-8 px-3 py-2">
                          <input
                            type="checkbox"
                            checked={
                              slSelected.size === slResult.matched.length &&
                              slResult.matched.length > 0
                            }
                            onChange={toggleAllSlRows}
                            className="accent-accent"
                            aria-label="Toggle all"
                          />
                        </th>
                        <th className="px-3 py-2">Symbol</th>
                        <th className="px-3 py-2 text-right">Entry</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">SL</th>
                        <th className="px-3 py-2 text-right">SL %</th>
                        <th className="px-3 py-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slResult.matched.map((m) => {
                        const checked = slSelected.has(m.tradeId);
                        return (
                          <tr
                            key={m.tradeId}
                            className="border-t border-line hover:bg-canvas/60"
                          >
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSlRow(m.tradeId)}
                                className="accent-accent"
                                aria-label={`Toggle ${m.symbol}`}
                              />
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-700">
                              {m.symbol}
                              {m.algoTicker !== m.symbol.toUpperCase() && (
                                <span className="ml-1 text-slate-400">
                                  ({m.algoTicker})
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                              {m.entry.toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                              {m.qty}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold text-ink">
                              {m.stopLoss.toFixed(2)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-red-500">
                              {m.stopLossPct.toFixed(1)}%
                            </td>
                            <td className="px-3 py-2 text-slate-400">{m.date}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {slResult.matched.length > 0 && slResult.mode !== "apply" && (
                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      setSlResult(null);
                      setSlSelected(new Set());
                    }}
                    className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-canvas"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={applySlFromAlgo}
                    disabled={slApplying || slSelected.size === 0}
                    className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    {slApplying
                      ? "Applying..."
                      : `Apply SL to ${slSelected.size} selected`}
                  </button>
                </div>
              )}

              {slResult.unmatched.length > 0 && (
                <details className="mt-3" open={slResult.matched.length === 0}>
                  <summary className="cursor-pointer text-xs font-medium text-amber-700">
                    Unmatched ({slResult.unmatched.length}) - no stop_placed in ledger
                    for this symbol / date / qty
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {slResult.unmatched.map((u) => (
                      <li key={u.tradeId} className="flex justify-between gap-3">
                        <span className="font-mono">
                          {u.symbol}
                          {u.algoTicker !== u.symbol.toUpperCase() && (
                            <span className="ml-1 text-slate-400">
                              (tried: {u.algoTicker})
                            </span>
                          )}
                        </span>
                        <span className="text-slate-400">
                          {u.date ?? "no entry"}
                        </span>
                        <span className="text-slate-400">qty {u.qty}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </section>
      )}

      {data && (
        <section className="overflow-clip rounded-2xl border border-line bg-panel p-2 shadow-sm sm:p-3">
          <JournalTable rows={data.trades} showAmounts={!filters.hideAmounts} onRefresh={() => fetchData(filters, page, sortKey, sortDir)} showSummary={false} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} startIndex={(data.page - 1) * data.pageSize} />
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
