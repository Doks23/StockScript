"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { CheckCircle2, Download, RefreshCw, X, Table2 } from "lucide-react";
import { JournalTable } from "@/components/journal-table";
import { JournalFilters } from "@/components/journal-filters";
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

type Filters = {
  symbol: string;
  from: string;
  to: string;
  status: string;
  reviewed: string;
  hideAmounts: boolean;
};

type Metrics = {
  totalTrades: number;
  totalAlloc: number;
  totalRealizedPnl: number;
  totalOpenPnl: number;
  totalUnrealizedPnl: number;
  totalPnl: number;
  totalImpact: number;
};

type SearchResult = {
  trades: GroupedTradeRow[];
  totalCount: number;
  totalPages: number;
  page: number;
  pageSize: number;
  metrics: Metrics;
};

const fmtAmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const pnlColor = (n: number) => n > 0 ? "text-emerald-600" : n < 0 ? "text-red-500" : "text-slate-400";
const signedAmt = (n: number) => `${n >= 0 ? "+" : ""}${fmtAmt.format(n)}`;
const hiddenAmt = "•••";

function TradesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    symbol: "",
    from: "",
    to: "",
    status: "OPEN",
    reviewed: "ALL",
    hideAmounts: false,
  });
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [toast, setToast] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const saved = searchParams.get("saved");
    if (saved === "created" || saved === "updated") {
      setToast(saved === "created" ? "Trade created." : "Trade updated.");
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
    fetchData(filters, page, sortKey, sortDir);
  }, [filters, page, sortKey, sortDir, fetchData]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const onFilterChange = useCallback((update: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...update }));
  }, []);

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

  const onFilterDebounced = useCallback((update: Partial<Filters>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, ...update }));
    }, 380);
  }, []);

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

      <section className="rounded-2xl border border-line bg-panel px-2.5 py-2 shadow-sm sm:px-5 sm:py-3">
        <div className="flex items-center justify-between gap-1.5 sm:gap-4">
          <JournalFilters
            values={filters}
            onChange={onFilterChange}
            onDebouncedChange={onFilterDebounced}
          />
          <Link
            href="/trades/simple"
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white p-1.5 text-sm text-slate-600 transition hover:bg-canvas sm:rounded-lg sm:px-3 sm:py-1.5"
          >
            <Table2 size={15} />
            <span className="hidden sm:inline">Simple View</span>
          </Link>
          <button
            onClick={handleDownload}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white p-1.5 text-sm text-slate-600 transition hover:bg-canvas sm:rounded-lg sm:px-3 sm:py-1.5"
            aria-label="Download CSV"
          >
            <Download size={15} />
            <span className="hidden sm:inline">Download</span>
          </button>
          <button
            onClick={() => fetchData(filters, page, sortKey, sortDir)}
            disabled={loading}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white p-1.5 text-sm text-slate-600 transition hover:bg-canvas disabled:opacity-50 sm:rounded-lg sm:px-3 sm:py-1.5"
            aria-label="Refresh"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </section>

      {metrics && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5 rounded-xl bg-canvas border border-line text-[12px]">
          <span className="text-slate-400 font-medium">{metrics.totalTrades} trades</span>
          <div className="flex items-center gap-1">
            <span className="text-slate-500">Alloc:</span>
            <span className="font-semibold text-slate-700">{fmtPct(metrics.totalAlloc)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-500">R:</span>
            <span className={`font-semibold ${pnlColor(metrics.totalRealizedPnl)}`}>
              {filters.hideAmounts ? hiddenAmt : signedAmt(metrics.totalRealizedPnl)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-500">U:</span>
            <span className={`font-semibold ${pnlColor(metrics.totalUnrealizedPnl)}`}>
              {filters.hideAmounts ? hiddenAmt : signedAmt(metrics.totalUnrealizedPnl)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-500">MTM:</span>
            <span className={`font-semibold ${pnlColor(metrics.totalPnl)}`}>
              {filters.hideAmounts ? hiddenAmt : signedAmt(metrics.totalPnl)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-slate-500">Impact:</span>
            <span className={`font-semibold ${pnlColor(metrics.totalImpact)}`}>
              {metrics.totalImpact >= 0 ? "+" : ""}{fmtPct(metrics.totalImpact)}
            </span>
          </div>
        </div>
      )}

      {loading && !data && (
        <div className="text-center py-12 text-slate-400 text-sm">Loading trades…</div>
      )}
      {error && (
        <div className="text-center py-12 text-red-500 text-sm">{error}</div>
      )}

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

export function TradesPageClient() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-slate-400 text-sm">Loading page…</div>}>
      <TradesPageContent />
    </Suspense>
  );
}
