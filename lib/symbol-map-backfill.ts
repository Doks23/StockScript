/**
 * Journal symbol -> TradingView ticker, from Dhan's published security list.
 * ─────────────────────────────────────────────────────────────────────
 * Dhan's scrip master is the only place the journal's company name
 * ("DECCAN GOLD MINES") and the ticker everything else charts by ("DECNGOLD")
 * appear side by side, so it is what fills SymbolQuoteMap for symbols nobody
 * has mapped by hand.
 *
 * Both Dhan syncs write through here - the live one because it has the master
 * open already, the statement one because that is where most rows enter the
 * journal - so a symbol is charted correctly no matter which route imported it.
 * ─────────────────────────────────────────────────────────────────────
 */

import { prisma } from "@/lib/prisma";
import type { ScripMaster, ScripRow } from "@/lib/brokers/dhan-scrip-master";

/**
 * The scrip row behind a journal symbol, or null.
 *
 * Two exact lookups, no fuzzy matching. Most journal rows are the company name
 * Dhan's statement API returns ("DECCAN GOLD MINES"), but rows that arrived
 * from the live trade book or a hand entry are already tickers ("DECNGOLD"),
 * and those would otherwise never find their own mapping. NSE is tried first
 * because it is the primary venue for these journals.
 *
 * Preview and backfill both call this, so the ticker shown before an import is
 * the ticker stored by it.
 */
export function lookupScrip(
  master: ScripMaster,
  journalSymbol: string,
): ScripRow | null {
  const symbol = journalSymbol.replace(/\s+/g, " ").trim().toUpperCase();
  if (!symbol) return null;

  return (
    master.byJournalSymbol.get(symbol) ??
    master.byTicker.get(`NSE:${symbol}`) ??
    master.byTicker.get(`BSE:${symbol}`) ??
    null
  );
}

/** SymbolQuoteMap stores the quote provider's form, so everything converts to it. */
export function toQuoteSymbolFromScrip(scrip: ScripRow): string {
  return `${scrip.ticker}${scrip.exchange === "BSE" ? ".BO" : ".NS"}`;
}

/** What a backfill did, so a caller can report it rather than guess. */
export type BackfillResult = {
  /** Mappings written by this run. */
  added: number;
  /** Journal symbols still unmapped - the master has no exact match for them. */
  unmapped: string[];
};

/**
 * Fill in TradingView tickers for journal symbols that have none.
 *
 * Scoped to every symbol the user owns, not just the ones an import touched,
 * so one run fixes a whole journal's worth of history.
 *
 * SymbolQuoteMap is also what the EOD price refresh reads, so this fixes
 * tomorrow's closing price for those symbols as well as the chart link. Only
 * exact matches are written; a fuzzy guess here would point a price at the
 * wrong company, which is worse than no mapping at all - so the ones that miss
 * are returned for the user to map by hand instead of being papered over.
 */
export async function backfillTradingViewTickers(
  userId: string,
  master: ScripMaster,
): Promise<BackfillResult> {
  const symbols = await prisma.trade.findMany({
    where: { userId },
    select: { symbol: true },
    distinct: ["symbol"],
  });

  const mapped = await prisma.symbolQuoteMap.findMany({
    where: { userId },
    select: { symbol: true },
  });
  const known = new Set(mapped.map((row) => row.symbol.toUpperCase()));

  const candidates = symbols
    .map((row) => row.symbol.toUpperCase())
    .filter((symbol) => !known.has(symbol))
    .map((symbol) => ({ symbol, scrip: lookupScrip(master, symbol) }));

  const unmapped = candidates.filter((entry) => !entry.scrip).map((entry) => entry.symbol);

  const rows = candidates
    .filter((entry): entry is { symbol: string; scrip: ScripRow } => Boolean(entry.scrip))
    .map((entry) => ({
      userId,
      symbol: entry.symbol,
      quoteSymbol: toQuoteSymbolFromScrip(entry.scrip),
      displayName: entry.scrip.companyName || null,
    }));

  if (rows.length === 0) return { added: 0, unmapped };

  const result = await prisma.symbolQuoteMap.createMany({ data: rows, skipDuplicates: true });
  return { added: result.count, unmapped };
}
