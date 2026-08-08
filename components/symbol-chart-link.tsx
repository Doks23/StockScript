"use client";

/**
 * A journal symbol that opens its TradingView chart in a new tab.
 *
 * A symbol with no confirmed ticker asks for one first, then charts it and
 * remembers it - so the mapping gets filled in at the moment it is missed,
 * rather than in a settings screen nobody visits.
 */

import { useEffect, useState } from "react";
import { chartSymbol, chartUrl, guessTicker, toQuoteSymbol } from "@/lib/tradingview";

type SymbolMap = Record<string, string>;

const keyOf = (symbol: string) => symbol.trim().toUpperCase();

/**
 * One fetch per page, shared by every link on it, kept in sync after a save.
 *
 * A journal renders hundreds of these, so the map cannot be per-component; and
 * saving a mapping has to update the rest of the table, since the same symbol
 * usually appears on more than one row.
 */
let cachedMap: SymbolMap | null = null;
let inflight: Promise<SymbolMap> | null = null;
const subscribers = new Set<(map: SymbolMap) => void>();

function loadSymbolMap(): Promise<SymbolMap> {
  if (cachedMap) return Promise.resolve(cachedMap);
  if (inflight) return inflight;

  inflight = fetch("/api/symbol-map")
    .then((res) => (res.ok ? res.json() : { maps: [] }))
    .then((data: { maps?: { symbol: string; quoteSymbol: string }[] }) => {
      cachedMap = Object.fromEntries(
        (data.maps ?? []).map((m) => [keyOf(m.symbol), m.quoteSymbol]),
      );
      return cachedMap;
    })
    .catch(() => {
      // A failed load is not fatal: every symbol simply falls back to its guess.
      cachedMap = {};
      return cachedMap;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

function rememberMapping(symbol: string, quoteSymbol: string) {
  cachedMap = { ...(cachedMap ?? {}), [keyOf(symbol)]: quoteSymbol };
  subscribers.forEach((notify) => notify(cachedMap!));
}

function useSymbolMap(): SymbolMap {
  const [map, setMap] = useState<SymbolMap>(() => cachedMap ?? {});

  useEffect(() => {
    subscribers.add(setMap);
    loadSymbolMap().then(setMap);
    return () => {
      subscribers.delete(setMap);
    };
  }, []);

  return map;
}

export function SymbolChartLink({
  symbol,
  className = "",
  children,
}: {
  symbol: string;
  className?: string;
  children: React.ReactNode;
}) {
  const map = useSymbolMap();
  const quoteSymbol = map[keyOf(symbol)] ?? null;
  const target = chartSymbol(symbol, quoteSymbol);

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // Mapped symbols are a plain link, so middle-click and copy-link still work.
    if (quoteSymbol) return;

    e.preventDefault();

    const typed = window.prompt(
      `TradingView ticker for "${symbol}"?\n\nExample: AVALON TECHNOLOGIES → AVALON`,
      guessTicker(symbol),
    );
    if (typed === null) return;

    const resolved = toQuoteSymbol(typed);
    if (!resolved) return;

    // Open before awaiting anything. prompt() is synchronous, so the click is
    // still a live user gesture here and the popup blocker lets the tab through;
    // opening after the save resolves would get it eaten.
    window.open(chartUrl(chartSymbol(symbol, resolved)), "_blank", "noopener,noreferrer");

    rememberMapping(symbol, resolved);
    fetch("/api/symbol-map", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, ticker: resolved }),
    }).catch(() => {
      // The chart is already open and the map is updated in memory; only the
      // next page load would notice, and it will simply ask again.
    });
  }

  return (
    <a
      href={chartUrl(target)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      title={
        quoteSymbol
          ? `Open ${target} on TradingView`
          : `Set the TradingView ticker for ${symbol}`
      }
      className={className}
    >
      {children}
    </a>
  );
}
