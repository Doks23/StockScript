/**
 * POST /api/trades/eod-prices
 * ─────────────────────────────────────────────────────────────────────
 * Refreshes the EOD (closing) price on every open position, which is what
 * drives unrealized P&L. Replaces typing each price in by hand.
 *
 * Two phases, mirroring the Dhan sync:
 *   - Default is a dry run. Prices are fetched and returned, nothing is written.
 *   - `commit: true` applies them, plus any mappings the user accepted.
 *
 * Symbols already mapped are priced automatically. Symbols resolved for the
 * first time come back as proposals carrying the company name, because a ticker
 * that merely exists is not proof it is the right company - APOLLO.NS is a real
 * NSE ticker for Apollo Micro Systems, which is very unlikely to be the Apollo
 * in a journal. Writing that price silently would corrupt unrealized P&L with
 * no visible symptom.
 * ─────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { buildGroupedJournalRows } from "@/lib/trade-utils";
import { QuoteError, fetchQuoteFlexible, resolveSymbol } from "@/lib/quotes/yahoo";

/** Each symbol costs a few throttled requests; a wide journal needs headroom. */
export const maxDuration = 120;

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
  /** true once a human has accepted this mapping; false means "please confirm". */
  mapped: boolean;
};

type ProblemRow = {
  symbol: string;
  openQty: number;
  tradeIds: string[];
  reason: string;
  options?: { quoteSymbol: string; name: string | null }[];
};

export async function POST(request: Request) {
  try {
    const user = await requireActiveUser();

    const body = (await request.json().catch(() => ({}))) as {
      commit?: boolean;
      /** Mappings the user accepted in the preview: journal symbol -> Yahoo symbol. */
      accept?: { symbol: string; quoteSymbol: string; name?: string | null }[];
    };

    const commit = body.commit === true;
    const accepted = new Map(
      (body.accept ?? [])
        .filter((entry) => entry?.symbol && entry?.quoteSymbol)
        .map((entry) => [
          entry.symbol.trim().toUpperCase(),
          { quoteSymbol: entry.quoteSymbol.trim(), name: entry.name ?? null },
        ]),
    );

    // 1. Open positions only. A closed trade's P&L is already realized, so a
    //    closing price would be noise.
    const trades = await prisma.trade.findMany({
      where: { userId: user.id },
      include: { transactions: true },
    });

    const openRows = buildGroupedJournalRows(trades as never).filter(
      (row) => row.derivedStatus === "OPEN" && row.openQty > 0,
    );

    if (openRows.length === 0) {
      return NextResponse.json(
        { dryRun: !commit, priced: [], problems: [], updated: 0, checked: 0 },
        { status: 200 },
      );
    }

    // 2. Collapse to unique symbols - one lookup serves every trade on it.
    const bySymbol = new Map<string, typeof openRows>();
    for (const row of openRows) {
      const key = row.symbol.trim().toUpperCase();
      const bucket = bySymbol.get(key);
      if (bucket) bucket.push(row);
      else bySymbol.set(key, [row]);
    }

    const savedMaps = await prisma.symbolQuoteMap.findMany({
      where: { userId: user.id, symbol: { in: [...bySymbol.keys()] } },
    });
    const savedBySymbol = new Map(savedMaps.map((m) => [m.symbol, m]));

    const priced: PricedRow[] = [];
    const problems: ProblemRow[] = [];

    for (const [symbol, rows] of bySymbol) {
      const openQty = rows.reduce((sum, row) => sum + row.openQty, 0);
      const tradeIds = rows.map((row) => row.id);
      const entryPrice = rows[0]?.weightedEntryPrice ?? 0;
      const previousClose = rows[0]?.closingPrice ?? null;

      // A mapping the user accepted in this request wins, then a stored one.
      const chosen = accepted.get(symbol) ?? savedBySymbol.get(symbol);

      try {
        if (chosen) {
          // Flexible, because a hand-typed ticker often omits the exchange
          // suffix and would otherwise fail silently on every run.
          const quote = await fetchQuoteFlexible(chosen.quoteSymbol);
          if (!quote) {
            problems.push({
              symbol,
              openQty,
              tradeIds,
              reason: `Mapped to ${chosen.quoteSymbol}, but no price came back on that ticker or with a .NS/.BO suffix. Enter a different ticker to replace the mapping.`,
            });
            continue;
          }
          priced.push({
            symbol,
            quoteSymbol: quote.quoteSymbol,
            name: quote.name,
            price: quote.price,
            asOf: quote.asOf?.toISOString() ?? null,
            openQty,
            entryPrice,
            previousClose,
            tradeIds,
            mapped: savedBySymbol.has(symbol) || accepted.has(symbol),
          });
          continue;
        }

        // On commit, an unmapped symbol cannot be applied whatever it resolves
        // to, so re-resolving it only burns requests against a rate-limited
        // endpoint. Report it and move on.
        if (commit) {
          problems.push({
            symbol,
            openQty,
            tradeIds,
            reason: "Skipped - no confirmed mapping. Fetch prices again and tick it to include it.",
          });
          continue;
        }

        const resolution = await resolveSymbol(symbol);

        if (resolution.kind === "resolved") {
          priced.push({
            symbol,
            quoteSymbol: resolution.quote.quoteSymbol,
            name: resolution.quote.name,
            price: resolution.quote.price,
            asOf: resolution.quote.asOf?.toISOString() ?? null,
            openQty,
            entryPrice,
            previousClose,
            tradeIds,
            mapped: false,
          });
        } else if (resolution.kind === "ambiguous") {
          problems.push({
            symbol,
            openQty,
            tradeIds,
            reason: "Several Indian listings match this name. Pick the right one.",
            options: resolution.options,
          });
        } else {
          problems.push({
            symbol,
            openQty,
            tradeIds,
            reason: "No Indian listing found. Enter the exchange ticker yourself.",
          });
        }
      } catch (error) {
        problems.push({
          symbol,
          openQty,
          tradeIds,
          reason:
            error instanceof QuoteError
              ? error.message
              : `Lookup failed (${(error as Error).message}).`,
        });
      }
    }

    const summary = {
      dryRun: !commit,
      checked: bySymbol.size,
      priced: priced.sort((a, b) => a.symbol.localeCompare(b.symbol)),
      problems: problems.sort((a, b) => a.symbol.localeCompare(b.symbol)),
      needsConfirmation: priced.filter((row) => !row.mapped).length,
    };

    // 3. Dry run stops here, having written nothing.
    if (!commit) {
      return NextResponse.json({ ...summary, updated: 0 }, { status: 200 });
    }

    // 4. Only apply prices whose mapping is confirmed - stored already, or
    //    accepted in this request. An unconfirmed guess is reported, not written.
    const applicable = priced.filter((row) => row.mapped);

    const updated = await prisma.$transaction(
      async (tx) => {
        // Remember only mappings that actually produced a price, and store the
        // ticker that worked rather than the raw text typed in. Persisting an
        // unverified mapping bakes in a symbol that fails on every future run.
        for (const row of applicable) {
          if (!accepted.has(row.symbol)) continue;
          await tx.symbolQuoteMap.upsert({
            where: { userId_symbol: { userId: user.id, symbol: row.symbol } },
            create: {
              userId: user.id,
              symbol: row.symbol,
              quoteSymbol: row.quoteSymbol,
              displayName: row.name,
            },
            update: { quoteSymbol: row.quoteSymbol, displayName: row.name },
          });
        }

        let count = 0;
        for (const row of applicable) {
          const result = await tx.trade.updateMany({
            // userId in the filter, so this can never touch another user's trade.
            where: { id: { in: row.tradeIds }, userId: user.id },
            data: { closingPrice: row.price },
          });
          count += result.count;
        }
        return count;
      },
      { timeout: 60_000, maxWait: 15_000 },
    );

    return NextResponse.json(
      { ...summary, dryRun: false, updated },
      { status: 200 },
    );
  } catch (error) {
    return handleApiError(error, "Unable to refresh EOD prices.");
  }
}
