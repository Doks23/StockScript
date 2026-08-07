/**
 * TradingView chart link for a journal symbol.
 *
 * Journal symbols came from broker CSV "Name" columns, so most are already NSE
 * tickers and open straight onto the right chart. A symbol that is really a
 * company name ("KALYAN JEWELLERS") lands on TradingView's search instead,
 * which is a fine place to finish the job by hand.
 */
export function tradingViewUrl(journalSymbol: string): string {
  const ticker = journalSymbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const symbol = ticker ? `NSE:${ticker}` : journalSymbol.trim();
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`;
}
