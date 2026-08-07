/**
 * Mapping a journal row onto a TradingView chart.
 * ─────────────────────────────────────────────────────────────────────
 * Two problems, both of them "which chart, framed how".
 *
 * 1. Journal symbols are frequently company names, not tickers (see
 *    lib/quotes/yahoo.ts). The confirmed SymbolQuoteMap is therefore the source
 *    of truth when one exists; the collapsed-name guess is only a starting point
 *    the user can correct inside the chart's own symbol search.
 *
 * 2. TradingView's free embed has no "scroll to this date" control. The only
 *    lever is `range`, a window that always ENDS at today. So the closest we can
 *    get to framing the entry is picking the smallest window that still reaches
 *    back past it - which puts the entry inside the view, with the trade to its
 *    right. Anything more precise needs the paid Charting Library.
 * ─────────────────────────────────────────────────────────────────────
 */

/** Windows the embed accepts. "60M" is five years; "12M" is one. */
export type ChartRange = "1M" | "3M" | "6M" | "12M" | "60M" | "ALL";

export const RANGE_OPTIONS: { value: ChartRange; label: string }[] = [
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
  { value: "12M", label: "1Y" },
  { value: "60M", label: "5Y" },
  { value: "ALL", label: "All" },
];

const RANGE_DAYS: Record<ChartRange, number> = {
  "1M": 30,
  "3M": 92,
  "6M": 183,
  "12M": 366,
  "60M": 1827,
  ALL: Number.POSITIVE_INFINITY,
};

const DAY_MS = 86_400_000;

/**
 * Smallest window that reaches back past the entry, with room to spare.
 *
 * The padding matters: a window sized exactly to the entry pins it to the left
 * edge, where the bars that set up the trade are cut off. 1.5x plus a week keeps
 * some pre-entry price action in frame, which is the part worth reviewing.
 */
export function rangeCoveringEntry(
  entryDate: Date | string | null | undefined,
  now: Date = new Date(),
): ChartRange {
  if (!entryDate) return "12M";
  const entry = new Date(entryDate).getTime();
  if (Number.isNaN(entry)) return "12M";

  const elapsed = Math.max(0, (now.getTime() - entry) / DAY_MS);
  const needed = elapsed * 1.5 + 7;

  for (const { value } of RANGE_OPTIONS) {
    if (RANGE_DAYS[value] >= needed) return value;
  }
  return "ALL";
}

export type TradingViewSymbol = {
  /** Exchange-qualified symbol, e.g. "NSE:KALYANKJIL". Empty if unresolvable. */
  symbol: string;
  /** false means this is a guess from the journal name, not a confirmed mapping. */
  mapped: boolean;
};

/**
 * Journal symbol (plus its confirmed quote symbol, if any) -> TradingView symbol.
 *
 * Yahoo suffixes map cleanly onto TradingView exchange prefixes: .NS is NSE,
 * .BO is BSE. Without a mapping all that is left is the collapsed journal name,
 * which is right for rows that were already tickers and wrong for rows that were
 * company names - hence the `mapped` flag, so the UI can say so.
 */
export function toTradingViewSymbol(
  journalSymbol: string,
  quoteSymbol?: string | null,
): TradingViewSymbol {
  const confirmed = (quoteSymbol ?? "").trim().toUpperCase();

  if (confirmed) {
    const suffixed = /^(.+)\.(NS|BO)$/.exec(confirmed);
    if (suffixed) {
      return {
        symbol: `${suffixed[2] === "NS" ? "NSE" : "BSE"}:${suffixed[1]}`,
        mapped: true,
      };
    }
    // Already exchange-qualified, or a bare ticker the user typed by hand.
    return {
      symbol: confirmed.includes(":") ? confirmed : `NSE:${confirmed}`,
      mapped: true,
    };
  }

  const bare = journalSymbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return { symbol: bare ? `NSE:${bare}` : "", mapped: false };
}

export function tradingViewUrl(symbol: string): string {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`;
}
