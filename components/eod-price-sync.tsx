"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, TrendingUp } from "lucide-react";

type PricedRow = {
  symbol: string;
  quoteSymbol: string;
  name: string | null;
  price: number;
  asOf: string | null;
  openQty: number;
  entryPrice: number;
  previousClose: number | null;
  tradeIds: string[];
  mapped: boolean;
};

type ProblemRow = {
  symbol: string;
  openQty: number;
  tradeIds: string[];
  reason: string;
  options?: { quoteSymbol: string; name: string | null }[];
};

type Result = {
  dryRun: boolean;
  checked: number;
  priced: PricedRow[];
  problems: ProblemRow[];
  needsConfirmation: number;
  updated: number;
};

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function asOfLabel(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
}

export function EodPriceSync({ onUpdated }: { onUpdated?: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  /** Proposed mappings the user has ticked, keyed by journal symbol. */
  const [accepted, setAccepted] = useState<Record<string, string>>({});
  /** Tickers typed in by hand for symbols nothing could resolve. */
  const [manual, setManual] = useState<Record<string, string>>({});

  async function call(commit: boolean) {
    setIsLoading(true);
    setError("");
    try {
      const accept = [
        ...(result?.priced ?? [])
          .filter((row) => !row.mapped && accepted[row.symbol])
          .map((row) => ({ symbol: row.symbol, quoteSymbol: accepted[row.symbol], name: row.name })),
        ...Object.entries(manual)
          .filter(([, ticker]) => ticker.trim().length > 0)
          .map(([symbol, ticker]) => ({ symbol, quoteSymbol: ticker.trim().toUpperCase() })),
      ];

      const response = await fetch("/api/trades/eod-prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commit, accept }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Could not fetch prices.");
        return;
      }

      setResult(data as Result);

      if (commit) {
        setAccepted({});
        setManual({});
        onUpdated?.();
      } else {
        // Pre-tick every proposal so the common case is one extra click, while
        // still forcing the user past a screen that names the matched company.
        const seeded: Record<string, string> = {};
        for (const row of (data as Result).priced) {
          if (!row.mapped) seeded[row.symbol] = row.quoteSymbol;
        }
        setAccepted(seeded);
      }
    } catch (err) {
      setError((err as Error).message || "Network error.");
    } finally {
      setIsLoading(false);
    }
  }

  const confirmable = (result?.priced ?? []).filter((row) => !row.mapped);
  const readyCount =
    (result?.priced ?? []).filter((row) => row.mapped).length +
    confirmable.filter((row) => accepted[row.symbol]).length +
    Object.values(manual).filter((t) => t.trim()).length;

  return (
    <div className="space-y-3 rounded-xl border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <TrendingUp className="h-4 w-4 text-accent" />
            EOD prices for open positions
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Pulls the latest daily close from Yahoo Finance and fills in the closing price that
            drives unrealized P&amp;L.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => call(false)}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          >
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Fetch prices
          </button>

          {result && result.dryRun && readyCount > 0 && (
            <button
              type="button"
              disabled={isLoading}
              onClick={() => call(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Apply to {readyCount}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && !result.dryRun && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Updated {result.updated} trade{result.updated === 1 ? "" : "s"}.
        </div>
      )}

      {result && result.priced.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line text-left text-slate-500">
                <th className="py-1.5 pr-3 font-medium">Journal symbol</th>
                <th className="py-1.5 pr-3 font-medium">Matched to</th>
                <th className="py-1.5 pr-3 text-right font-medium">Qty</th>
                <th className="py-1.5 pr-3 text-right font-medium">Entry</th>
                <th className="py-1.5 pr-3 text-right font-medium">Close</th>
                <th className="py-1.5 font-medium">Use</th>
              </tr>
            </thead>
            <tbody>
              {result.priced.map((row) => (
                <tr key={row.symbol} className="border-b border-line/50">
                  <td className="py-1.5 pr-3 font-medium text-slate-700">{row.symbol}</td>
                  <td className="py-1.5 pr-3">
                    <span className="font-mono text-slate-700">{row.quoteSymbol}</span>
                    {row.name && <span className="ml-1.5 text-slate-500">{row.name}</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{row.openQty}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-slate-500">
                    {fmt(row.entryPrice)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-slate-800">
                    {fmt(row.price)}
                    {row.asOf && <span className="ml-1 text-[10px] text-slate-400">{asOfLabel(row.asOf)}</span>}
                  </td>
                  <td className="py-1.5">
                    {row.mapped ? (
                      <span className="text-[10px] text-green-700">confirmed</span>
                    ) : (
                      <label className="flex items-center gap-1.5 text-[10px] text-amber-700">
                        <input
                          type="checkbox"
                          checked={Boolean(accepted[row.symbol])}
                          onChange={(event) =>
                            setAccepted((prev) => {
                              const next = { ...prev };
                              if (event.target.checked) next[row.symbol] = row.quoteSymbol;
                              else delete next[row.symbol];
                              return next;
                            })
                          }
                        />
                        check this
                      </label>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && result.needsConfirmation > 0 && result.dryRun && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {result.needsConfirmation} symbol{result.needsConfirmation === 1 ? " is" : "s are"} being
          matched for the first time. Check the company name in the &ldquo;Matched to&rdquo; column
          before applying &mdash; a ticker existing does not mean it is the right company. Once
          applied, the mapping is remembered and future refreshes are a single click.
        </p>
      )}

      {result && result.problems.length > 0 && (
        <div className="space-y-2 rounded-lg border border-line bg-canvas px-3 py-2">
          <p className="text-xs font-medium text-slate-600">
            {result.problems.length} symbol{result.problems.length === 1 ? "" : "s"} need a ticker
          </p>
          {result.problems.map((problem) => (
            <div key={problem.symbol} className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium text-slate-700">{problem.symbol}</span>
                <span className="text-slate-500">{problem.reason}</span>
              </div>
              {problem.options ? (
                <select
                  value={manual[problem.symbol] ?? ""}
                  onChange={(event) =>
                    setManual((prev) => ({ ...prev, [problem.symbol]: event.target.value }))
                  }
                  className="w-full rounded-md border border-line px-2 py-1 text-xs"
                >
                  <option value="">Choose the right listing…</option>
                  {problem.options.map((option) => (
                    <option key={option.quoteSymbol} value={option.quoteSymbol}>
                      {option.quoteSymbol} — {option.name ?? "unknown"}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={manual[problem.symbol] ?? ""}
                  onChange={(event) =>
                    setManual((prev) => ({ ...prev, [problem.symbol]: event.target.value }))
                  }
                  placeholder="Yahoo ticker, e.g. SWANENERGY.NS"
                  className="w-full rounded-md border border-line px-2 py-1 font-mono text-xs"
                />
              )}
            </div>
          ))}
          <p className="text-[10px] text-slate-500">
            Enter a ticker then press Fetch prices again to check it before applying.
          </p>
        </div>
      )}
    </div>
  );
}
