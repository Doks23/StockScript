"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { JournalFilters } from "@/components/journal-filters";
import { SimpleJournalTable } from "@/components/simple-journal-table";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { GroupedTradeRow } from "@/lib/trade-utils";

type Filters = {
  symbol: string;
  from: string;
  to: string;
  status: string;
  reviewed: string;
  hideAmounts: boolean;
};

type SearchResult = {
  trades: GroupedTradeRow[];
  totalCount: number;
  totalPages: number;
  page: number;
  pageSize: number;
};

function SimpleJournalContent() {
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
      if (f.reviewed !== "ALL") sp.set("reviewed", f.reviewed);
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
    fetchData(filters, page);
  }, [filters, page, fetchData]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const onFilterChange = useCallback((update: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...update }));
  }, []);

  const onFilterDebounced = useCallback((update: Partial<Filters>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, ...update }));
    }, 380);
  }, []);

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
        <div className="flex items-center justify-between gap-1.5 sm:gap-4">
          <JournalFilters
            values={filters}
            onChange={onFilterChange}
            onDebouncedChange={onFilterDebounced}
          />
        </div>
      </section>

      {loading && !data && (
        <div className="text-center py-12 text-slate-400 text-sm">Loading trades…</div>
      )}
      {error && (
        <div className="text-center py-12 text-red-500 text-sm">{error}</div>
      )}

      {data && (
        <section className="overflow-hidden rounded-2xl border border-line bg-panel p-2 shadow-sm sm:p-3">
          <SimpleJournalTable rows={data.trades} />
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
