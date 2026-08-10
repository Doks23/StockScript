/**
 * POST /api/trades/sync-today/charges
 * ─────────────────────────────────────────────────────────────────────
 * Second half of the same-day sync: put the real costs on rows that were
 * written from the live trade book, once Dhan's statement publishes them.
 *
 * The live trade book has no brokerage, STT, stamp duty, GST or exchange
 * charges, so rows written by ../route.ts land with charges 0 and are tagged
 * DHAN_TODAY. This route pulls the statement for a past day, pairs each
 * statement fill with the row already in the journal, adds the charges, and
 * re-tags the row DHAN_API - meaning "this fill now carries everything the
 * statement knows".
 *
 * Pairing is by content, not by id, and the matched row's externalTradeId is
 * rewritten to the *statement's* fingerprint. That is the point of the whole
 * exercise: from then on the EOD sync computes the same id, finds it stored,
 * and skips the fill instead of importing a duplicate. If the two APIs ever
 * disagree on a timestamp to the second, this is what absorbs it.
 *
 * Running it twice is harmless - the second run finds no DHAN_TODAY rows left
 * for that day, so no charge is ever added twice.
 * ─────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { invalidateUserTrades } from "@/lib/cache";
import { calculateTradeMetrics, deriveTradeTypeAndStatus } from "@/lib/trade-utils";
import {
  DhanApiError,
  DhanAuthError,
  fetchDhanFills,
  fetchDhanProfile,
  mapDhanFills,
  toIstDateString,
} from "@/lib/brokers/dhan";
import { TODAY_SOURCE } from "@/lib/brokers/dhan-today";

export const maxDuration = 120;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Start and end of one IST calendar day, as instants. */
function istDayBounds(date: string) {
  const start = new Date(`${date}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Prices round-trip through a float column, so pair on a fixed number of places. */
function pairKey(symbol: string, type: string, price: number, quantity: number) {
  return `${symbol}|${type}|${price.toFixed(4)}|${quantity.toFixed(4)}`;
}

export async function POST(request: Request) {
  try {
    const user = await requireActiveUser();

    const body = (await request.json().catch(() => ({}))) as {
      accessToken?: string;
      date?: string;
      commit?: boolean;
    };

    const accessToken = (body.accessToken ?? "").trim();
    if (!accessToken) {
      return NextResponse.json({ error: "Dhan access token is required." }, { status: 400 });
    }

    if (body.date && !DATE_RE.test(body.date)) {
      return NextResponse.json({ error: "date must be in YYYY-MM-DD format." }, { status: 400 });
    }

    const commit = body.commit === true;

    // Default to the oldest day still awaiting charges, so repeated presses
    // work through the backlog instead of re-doing the newest day.
    const oldestPending = await prisma.transaction.findFirst({
      where: { trade: { userId: user.id }, source: TODAY_SOURCE },
      orderBy: { dateTime: "asc" },
      select: { dateTime: true },
    });

    if (!body.date && !oldestPending) {
      return NextResponse.json(
        {
          date: null,
          pendingRows: 0,
          matched: 0,
          chargesApplied: 0,
          tradesUpdated: 0,
          unmatchedStatementFills: [],
          unmatchedJournalRows: [],
          warnings: ["Nothing is waiting for charges - every synced fill already has them."],
        },
        { status: 200 },
      );
    }

    const date = body.date ?? toIstDateString(oldestPending!.dateTime);
    const { start, end } = istDayBounds(date);

    const pending = await prisma.transaction.findMany({
      where: {
        trade: { userId: user.id },
        source: TODAY_SOURCE,
        dateTime: { gte: start, lt: end },
      },
      select: {
        id: true,
        tradeId: true,
        type: true,
        price: true,
        quantity: true,
        externalTradeId: true,
        trade: { select: { symbol: true } },
      },
    });

    if (pending.length === 0) {
      return NextResponse.json(
        {
          date,
          pendingRows: 0,
          matched: 0,
          chargesApplied: 0,
          tradesUpdated: 0,
          unmatchedStatementFills: [],
          unmatchedJournalRows: [],
          warnings: [`No rows from ${date} are waiting for charges.`],
        },
        { status: 200 },
      );
    }

    await fetchDhanProfile(accessToken);

    const { fills, warnings } = await fetchDhanFills(accessToken, date, date);
    const { mapped } = mapDhanFills(fills);

    if (mapped.length === 0) {
      warnings.push(
        `Dhan's statement for ${date} is empty. It usually publishes after the market closes - try again later today or tomorrow.`,
      );
    }

    // Bucket the journal's rows by content so each statement fill claims one.
    // Two fills of one order can be identical, hence a queue per key.
    const buckets = new Map<string, typeof pending>();
    for (const row of pending) {
      const key = pairKey(row.trade.symbol, row.type, row.price, row.quantity);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(row);
      else buckets.set(key, [row]);
    }

    const claimed: {
      rowId: string;
      tradeId: string;
      statementKey: string;
      charges: number;
    }[] = [];
    const unmatchedStatementFills: string[] = [];

    for (const item of mapped) {
      const tx = item.transaction;
      const key = pairKey(tx.ticker, tx.type, tx.price, tx.quantity);
      const bucket = buckets.get(key);
      const row = bucket?.shift();

      if (!row) {
        // Either it was already reconciled on an earlier run, or it is a fill
        // the live sync never saw. Only the caller can tell which, so say so.
        unmatchedStatementFills.push(
          `${tx.ticker} ${tx.type} ${tx.quantity} @ ${tx.price}`,
        );
        continue;
      }

      claimed.push({
        rowId: row.id,
        tradeId: row.tradeId,
        statementKey: item.externalTradeId ?? row.externalTradeId ?? "",
        charges: tx.charges ?? 0,
      });
    }

    const unmatchedJournalRows = [...buckets.values()]
      .flat()
      .map((row) => `${row.trade.symbol} ${row.type} ${row.quantity} @ ${row.price}`);

    if (unmatchedStatementFills.length > 0) {
      warnings.push(
        `${unmatchedStatementFills.length} statement fill(s) had no matching row from the live sync. They are not part of this backfill - the full Dhan sync will import them as new.`,
      );
    }

    if (unmatchedJournalRows.length > 0) {
      warnings.push(
        `${unmatchedJournalRows.length} row(s) from ${date} are not in Dhan's statement for that day. They keep charges 0 and stay tagged for a later run.`,
      );
    }

    const chargesByTrade = new Map<string, number>();
    for (const item of claimed) {
      chargesByTrade.set(item.tradeId, (chargesByTrade.get(item.tradeId) ?? 0) + item.charges);
    }

    const chargesApplied = claimed.reduce((sum, item) => sum + item.charges, 0);

    const summary = {
      date,
      dryRun: !commit,
      pendingRows: pending.length,
      statementFills: mapped.length,
      matched: claimed.length,
      chargesApplied: Number(chargesApplied.toFixed(2)),
      tradesUpdated: chargesByTrade.size,
      unmatchedStatementFills: unmatchedStatementFills.slice(0, 20),
      unmatchedJournalRows: unmatchedJournalRows.slice(0, 20),
      warnings,
    };

    if (!commit || claimed.length === 0) {
      return NextResponse.json(summary, { status: 200 });
    }

    // Net P&L is stored gross of nothing - it already has charges subtracted -
    // so every touched trade has to be recomputed once its charges change.
    const affected = await prisma.trade.findMany({
      where: { id: { in: [...chargesByTrade.keys()] } },
      include: { transactions: true },
    });

    await prisma.$transaction(
      async (tx) => {
        for (const item of claimed) {
          await tx.transaction.update({
            where: { id: item.rowId },
            data: {
              source: "DHAN_API",
              ...(item.statementKey ? { externalTradeId: item.statementKey } : {}),
            },
          });
        }

        for (const trade of affected) {
          const charges = trade.charges + (chargesByTrade.get(trade.id) ?? 0);
          const { tradeType, status } = deriveTradeTypeAndStatus(trade.transactions);
          const metrics = calculateTradeMetrics({
            tradeType,
            status,
            charges,
            capitalUsed: trade.capitalUsed,
            transactions: trade.transactions.map((leg) => ({
              type: leg.type,
              price: leg.price,
              quantity: leg.quantity,
            })),
          });

          await tx.trade.update({
            where: { id: trade.id },
            data: { charges, netPnl: metrics.realizedPnl },
          });
        }
      },
      { timeout: 60_000, maxWait: 15_000 },
    );

    invalidateUserTrades(user.id);

    return NextResponse.json({ ...summary, dryRun: false }, { status: 200 });
  } catch (error) {
    if (error instanceof DhanAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof DhanApiError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        {
          error:
            "One of these fills is already stored under the statement's own id, so nothing was changed. Preview again.",
        },
        { status: 409 },
      );
    }
    return handleApiError(error, "Unable to backfill charges from Dhan.");
  }
}
