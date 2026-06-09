"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { Download, RefreshCw } from "lucide-react";
import { JournalTable } from "@/components/journal-table";
import { JournalFilters } from "@/components/journal-filters";
import { useRouter } from "next/navigation";
import type { GroupedTradeRow } from "@/lib/trade-utils";

type Filters = {
  symbol: string;
  from: string;
  to: string;
  status: string;
  hideAmounts: boolean;
};

type Metrics = {
  totalTrades: number;
  totalAlloc: number;
  totalRealizedPnl: number;
  totalOpenPnl: number;
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

function TradesPageContent() {
  const router = useRouter();
  const [data, setData] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    symbol: "",
    from: "",
    to: "",
    status: "OPEN",
    hideAmounts: false,
  });
  const [page, setPage] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async (f: Filters, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams();
      if (f.symbol) sp.set("symbol", f.symbol);
      if (f.from) sp.set("from", f.from);
      if (f.to) sp.set("to", f.to);
      sp.set("status", f.status);
      sp.set("page", String(p));
      sp.set("pageSize", "20");

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
    fetchData(filters, page);
  }, [filters, page, fetchData]);

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

  const metrics = data?.metrics;
  const totalPages = data?.totalPages || 1;

  return (
    <div className="space-y-3 sm:space-y-4">
      <section className="rounded-2xl border border-line bg-panel px-2.5 py-2 shadow-sm sm:px-5 sm:py-3">
        <div className="flex items-center justify-between gap-1.5 sm:gap-4">
          <JournalFilters
            values={filters}
            onChange={onFilterChange}
            onDebouncedChange={onFilterDebounced}
          />
          <button
            onClick={handleDownload}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white p-1.5 text-sm text-slate-600 transition hover:bg-canvas sm:rounded-lg sm:px-3 sm:py-1.5"
            aria-label="Download CSV"
          >
            <Download size={15} />
            <span className="hidden sm:inline">CSV</span>
          </button>
          <button
            onClick={() => fetchData(filters, page)}
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
          {metrics.totalPnl !== 0 && (
            <div className="flex items-center gap-1">
              <span className="text-slate-500">MTM:</span>
              <span className={`font-semibold ${pnlColor(metrics.totalPnl)}`}>
                {metrics.totalPnl >= 0 ? "+" : ""}{fmtAmt.format(metrics.totalPnl)}
              </span>
            </div>
          )}
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
          <JournalTable rows={data.trades} showAmounts={!filters.hideAmounts} onRefresh={() => fetchData(filters, page)} />
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
