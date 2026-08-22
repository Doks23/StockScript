/**
 * Journal symbol -> TradingView chart.
 * ─────────────────────────────────────────────────────────────────────
 * Broker symbols are company names as often as tickers ("AVALON TECHNOLOGIES"
 * is charted as NSE:AVALON), so the link needs a mapping to be right.
 *
 * That mapping already exists: SymbolQuoteMap, written whenever a symbol is
 * confirmed in the EOD price sync. It is stored in the quote provider's format
 * ("AVALON.NS") because the price sync reads the same rows, so everything here
 * converts to and from that format rather than introducing a second one - two
 * stores of the same fact would drift the first time a company relists.
 * ─────────────────────────────────────────────────────────────────────
 */

/** Indian listings, as provider suffix -> TradingView exchange prefix. */
const EXCHANGES = [
  { suffix: ".NS", prefix: "NSE" },
  { suffix: ".BO", prefix: "BSE" },
] as const;

/** Journal symbol collapsed to a plausible ticker - the prompt's starting guess. */
export function guessTicker(journalSymbol: string): string {
  return journalSymbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Strip punctuation a ticker cannot contain, but keep what it can.
 *
 * Real tickers are not all alphanumeric - M&M, BAJAJ-AUTO, M_M - and collapsing
 * those to MM or BAJAJAUTO produces a symbol that charts nothing. Whatever the
 * user typed is preserved, since they are reading it off TradingView.
 */
function sanitiseTicker(value: string): string {
  return value.replace(/[^A-Z0-9&\-_]/g, "");
}

/**
 * Whatever the user typed -> the stored provider symbol, or null if unusable.
 *
 * People type the TradingView form ("AVALON", "NSE:AVALON"), not the provider
 * form, so both are accepted and normalised. An input with no exchange at all
 * defaults to NSE, which is the primary venue for these journals.
 */
export function toQuoteSymbol(input: string): string | null {
  const raw = input.trim().toUpperCase();
  if (!raw) return null;

  const prefixed = /^(NSE|BSE):(.+)$/.exec(raw);
  if (prefixed) {
    const ticker = sanitiseTicker(prefixed[2]);
    return ticker ? `${ticker}${prefixed[1] === "NSE" ? ".NS" : ".BO"}` : null;
  }

  const suffixed = /^(.+)(\.NS|\.BO)$/.exec(raw);
  if (suffixed) {
    const ticker = sanitiseTicker(suffixed[1]);
    return ticker ? `${ticker}${suffixed[2]}` : null;
  }

  const ticker = sanitiseTicker(raw);
  return ticker ? `${ticker}.NS` : null;
}

/**
 * The symbol to chart: the confirmed mapping when there is one, otherwise the
 * collapsed journal name. That fallback is right for rows that were already
 * tickers and wrong for rows that were company names, so callers decide what to
 * do about a missing mapping by checking for one themselves - it is not
 * something this can infer from the result.
 */
export function chartSymbol(
  journalSymbol: string,
  quoteSymbol?: string | null,
): string {
  const confirmed = (quoteSymbol ?? "").trim().toUpperCase();

  if (confirmed) {
    for (const { suffix, prefix } of EXCHANGES) {
      if (confirmed.endsWith(suffix)) {
        return `${prefix}:${confirmed.slice(0, -suffix.length)}`;
      }
    }
    return confirmed.includes(":") ? confirmed : `NSE:${confirmed}`;
  }

  const guess = guessTicker(journalSymbol);
  return guess ? `NSE:${guess}` : "";
}

/**
 * The bare TradingView ticker for display - "KALYANKJIL", not "NSE:KALYANKJIL.NS".
 *
 * The journal carries the broker's company name ("KWALITY WALLS"), which is not
 * what the chart is called. Where a mapping exists this is the name the user
 * actually reads on TradingView; where it does not, the collapsed guess is
 * still closer to a ticker than the full name is.
 */
export function tickerOf(
  journalSymbol: string,
  quoteSymbol?: string | null,
): string {
  const full = chartSymbol(journalSymbol, quoteSymbol);
  const withoutExchange = full.includes(":") ? full.slice(full.indexOf(":") + 1) : full;
  return withoutExchange || journalSymbol;
}

export function chartUrl(symbol: string): string {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`;
}
