"use client";

/**
 * TradingView chart for a journal row, opened by clicking its symbol.
 *
 * The embed cannot be scrolled to a date programmatically - see the note in
 * lib/tradingview.ts - so the entry is framed by choosing the smallest window
 * that still reaches back past it. The entry and exit are also printed in the
 * header, because the chart itself cannot carry markers for them.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import { format } from "date-fns";
import {
  RANGE_OPTIONS,
  rangeCoveringEntry,
  toTradingViewSymbol,
  tradingViewUrl,
  type ChartRange,
} from "@/lib/tradingview";
import type { GroupedTradeRow } from "@/lib/trade-utils";

export type ChartTradeContext = {
  symbol: string;
  tradeType: string;
  entryDate: Date | string | null;
  entryPrice: number;
  exitDate: Date | string | null;
  exitPrice: number;
  stopLoss: number | null;
};

/** What the chart needs from a journal row: the instrument, and where the trade sits on it. */
export function chartContextFromRow(row: GroupedTradeRow): ChartTradeContext {
  return {
    symbol: row.symbol,
    tradeType: row.tradeType,
    entryDate: row.entryLegs[0]?.dateTime ?? row.entryDate,
    entryPrice: row.weightedEntryPrice,
    exitDate: row.exitDateTime,
    exitPrice: row.exitPrice,
    stopLoss: row.stopLoss,
  };
}

type TradingViewWidgetOptions = Record<string, unknown>;

declare global {
  interface Window {
    TradingView?: { widget: new (options: TradingViewWidgetOptions) => unknown };
  }
}

const TV_SCRIPT_SRC = "https://s3.tradingview.com/tv.js";

/** One script tag per page, shared by every chart that opens after it. */
let tvScriptPromise: Promise<void> | null = null;

function loadTradingViewScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.TradingView) return Promise.resolve();
  if (tvScriptPromise) return tvScriptPromise;

  tvScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TV_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Let the next open retry - a blocked request now is often a transient
      // network or extension issue rather than a permanent one.
      tvScriptPromise = null;
      reject(new Error("Could not load TradingView."));
    };
    document.head.appendChild(script);
  });

  return tvScriptPromise;
}

async function fetchQuoteSymbol(journalSymbol: string): Promise<string | null> {
  try {
    const res = await fetch("/api/symbol-map");
    if (!res.ok) return null;
    const data = (await res.json()) as {
      maps?: { symbol: string; quoteSymbol: string }[];
    };
    const wanted = journalSymbol.trim().toUpperCase();
    return (
      data.maps?.find((m) => m.symbol.trim().toUpperCase() === wanted)?.quoteSymbol ?? null
    );
  } catch {
    return null;
  }
}

const fmtPrice = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmtDate(d: Date | string | null | undefined) {
  if (!d) return null;
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? null : format(date, "dd MMM yy");
}

function Fact({
  label,
  value,
  tone = "text-slate-700",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-canvas px-2.5 py-1.5">
      <p className="text-[9px] font-medium uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className={`mt-0.5 text-[12px] font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

export function TradingViewChartModal({
  trade,
  onClose,
}: {
  trade: ChartTradeContext;
  onClose: () => void;
}) {
  const containerId = `tv-chart-${useId().replace(/:/g, "")}`;
  const containerRef = useRef<HTMLDivElement>(null);

  const [quoteSymbol, setQuoteSymbol] = useState<string | null>(null);
  const [mappingLoaded, setMappingLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<ChartRange>(() =>
    rangeCoveringEntry(trade.entryDate),
  );

  const { symbol, mapped } = useMemo(
    () => toTradingViewSymbol(trade.symbol, quoteSymbol),
    [trade.symbol, quoteSymbol],
  );

  const entryDate = fmtDate(trade.entryDate);
  const exitDate = fmtDate(trade.exitDate);
  const isLong = trade.tradeType === "LONG";

  // Esc to close, and keep the page behind from scrolling under the overlay.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  // Resolve the instrument before drawing, so the chart is not built once on a
  // guess and again on the confirmed mapping a moment later.
  useEffect(() => {
    let cancelled = false;
    fetchQuoteSymbol(trade.symbol).then((resolved) => {
      if (cancelled) return;
      setQuoteSymbol(resolved);
      setMappingLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [trade.symbol]);

  useEffect(() => {
    if (!mappingLoaded || !symbol) return;

    let cancelled = false;
    setError(null);

    loadTradingViewScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.TradingView) return;
        // The widget appends an iframe rather than replacing one, so the
        // container has to be emptied before every rebuild.
        containerRef.current.innerHTML = "";
        new window.TradingView.widget({
          container_id: containerId,
          symbol,
          interval: "D",
          range,
          timezone: "Asia/Kolkata",
          theme: "light",
          style: "1",
          locale: "in",
          autosize: true,
          withdateranges: true,
          allow_symbol_change: true,
          enable_publishing: false,
          save_image: false,
          hide_side_toolbar: false,
        });
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });

    return () => {
      cancelled = true;
    };
  }, [containerId, symbol, range, mappingLoaded]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${trade.symbol} chart`}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-2 backdrop-blur-[1px] sm:p-4"
    >
      <div className="flex h-full max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2.5 sm:px-4">
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold ${
              isLong ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
            }`}
          >
            {isLong ? "L" : "S"}
          </span>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink">
            {trade.symbol}
          </h2>
          {symbol && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-slate-500">
              {symbol}
            </span>
          )}

          <div className="ml-auto flex items-center gap-1">
            <Link
              href={`/trades/${encodeURIComponent(trade.symbol)}`}
              className="rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-accent hover:text-accent"
            >
              Trade details
            </Link>
            {symbol && (
              <a
                href={tradingViewUrl(symbol)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-slate-600 transition hover:border-accent hover:text-accent"
              >
                TradingView
                <ExternalLink size={11} />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close chart"
              className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 sm:px-4">
          <Fact
            label="Entry"
            value={`${trade.entryPrice > 0 ? fmtPrice.format(trade.entryPrice) : "—"}${
              entryDate ? ` · ${entryDate}` : ""
            }`}
          />
          <Fact
            label="Exit"
            value={
              trade.exitPrice > 0
                ? `${fmtPrice.format(trade.exitPrice)}${exitDate ? ` · ${exitDate}` : ""}`
                : "Open"
            }
          />
          {trade.stopLoss ? (
            <Fact
              label="Stop"
              value={fmtPrice.format(trade.stopLoss)}
              tone="text-red-500"
            />
          ) : null}

          <div className="ml-auto flex items-center gap-1.5">
            <span
              className="text-[10px] uppercase tracking-wider text-slate-400"
              title="TradingView's embed can only show a window ending today, so the range is sized to reach back past the entry."
            >
              Window
            </span>
            <div className="flex overflow-hidden rounded-lg border border-line">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRange(option.value)}
                  className={`px-2 py-1 text-[11px] font-medium transition ${
                    range === option.value
                      ? "bg-slate-800 text-white"
                      : "bg-white text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {mappingLoaded && !mapped && symbol && (
          <p className="border-b border-amber-100 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700 sm:px-4">
            No confirmed ticker for &ldquo;{trade.symbol}&rdquo; — showing {symbol} as a
            guess. Use the chart&apos;s symbol search to switch, or confirm a mapping from
            the EOD price sync.
          </p>
        )}

        <div className="relative min-h-0 flex-1 bg-slate-50">
          {error ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
              {error} Check your connection or open it on{" "}
              {symbol ? (
                <a
                  href={tradingViewUrl(symbol)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 text-accent underline"
                >
                  tradingview.com
                </a>
              ) : (
                "tradingview.com"
              )}
              .
            </div>
          ) : !symbol ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
              No chartable ticker for &ldquo;{trade.symbol}&rdquo;.
            </div>
          ) : (
            <div id={containerId} ref={containerRef} className="h-full w-full" />
          )}
        </div>
      </div>
    </div>
  );
}
