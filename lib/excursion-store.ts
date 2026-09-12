/**
 * MAE / MFE, stored on the trade.
 * ─────────────────────────────────────────────────────────────────────
 * Measuring a trade costs Dhan requests, and a closed trade's price path never
 * changes. So each result is written onto its Trade (excursion / excursionKey /
 * excursionAt) and read back from there:
 *
 *   closed   measured once, reused until excursionKey stops matching - the
 *            fills, stop or P&L changed, or EXCURSION_VERSION moved on
 *   open     still moving: re-measured whenever something refreshes it - a
 *            Dhan sync, an EOD price refresh, or the tab's Update button -
 *            and read back with excursionAt as its "as of"
 *
 * Reading needs no token and makes no Dhan call. Refreshing needs the token and
 * runs in batches the caller keeps asking for, so a long list cannot outrun a
 * request's time limit.
 * ─────────────────────────────────────────────────────────────────────
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildGroupedJournalRows, type GroupedTradeRow } from "@/lib/trade-utils";
import { fetchDhanProfile, shiftDateString, toIstDateString } from "@/lib/brokers/dhan";
import { fetchMinuteBars } from "@/lib/brokers/dhan-charts";
import { getScripMaster, type ScripRow } from "@/lib/brokers/dhan-scrip-master";
import { lookupScrip, toQuoteSymbolFromScrip } from "@/lib/symbol-map-backfill";
import {
  EXCURSION_VERSION,
  IST_OFFSET_MS,
  computeExcursion,
  type ExcursionResult,
  type PriceBar,
} from "@/lib/trade-excursions";

/** Stop starting new symbols past this point; the caller asks for the rest. */
const BATCH_BUDGET_MS = 60_000;

export type ExcursionProblem = { symbol: string; reason: string; quoteSymbol?: string | null };

/** A stored result as the tab receives it, with when it was measured. */
export type StoredExcursion = ExcursionResult & { measuredAt: string };

/**
 * Everything a stored result depends on. Setup and notes are left out - they
 * are relabelled freely and are overlaid from the trade when read.
 */
export function excursionKey(row: GroupedTradeRow) {
  const legs = (list: GroupedTradeRow["entryLegs"]) =>
    list.map((leg) => `${leg.dateTime.getTime()}@${leg.price}x${leg.qty}`).join(",");
  return [
    `v${EXCURSION_VERSION}`,
    row.tradeType,
    legs(row.entryLegs),
    legs(row.exitLegs),
    row.stopLoss ?? "",
    row.realizedPnl,
  ].join("|");
}

/** The positions the tab covers - closed with an exit, or open with shares still held. */
async function loadPositions(userId: string) {
  const trades = await prisma.trade.findMany({
    where: { userId },
    include: { transactions: true },
  });
  const rows = buildGroupedJournalRows(trades as never).filter(
    (row) =>
      row.weightedEntryPrice > 0 &&
      row.entryLegs.length > 0 &&
      (row.derivedStatus === "OPEN" ? row.openQty > 0 : row.exitQty > 0),
  );
  const stored = new Map(trades.map((trade) => [trade.id, trade]));
  return { rows, stored };
}

type StoredTrade = { excursion: Prisma.JsonValue | null; excursionKey: string | null; excursionAt: Date | null };

function isCurrent(row: GroupedTradeRow, trade: StoredTrade | undefined) {
  return Boolean(trade?.excursion) && trade?.excursionKey === excursionKey(row);
}

/**
 * What is stored, for the tab: no Dhan, no token.
 *
 * `missing` counts positions that need a refresh to be right - closed trades
 * never measured or changed since, and open ones whose fills moved on. A closed
 * trade whose stored result no longer matches is withheld rather than shown
 * wrong; an open one is shown as of when it was measured.
 */
export async function readExcursions(userId: string, year: number | null) {
  const { rows, stored } = await loadPositions(userId);

  const years = Array.from(
    new Set(
      rows
        .map((row) => row.entryLegs[0]?.dateTime.getFullYear())
        .filter((value): value is number => typeof value === "number"),
    ),
  ).sort((a, b) => b - a);

  const inYear = year === null ? rows : rows.filter((row) => row.entryLegs[0]?.dateTime.getFullYear() === year);

  const results: StoredExcursion[] = [];
  let missing = 0;
  for (const row of inYear) {
    const trade = stored.get(row.id);
    const current = isCurrent(row, trade);
    const showable = row.derivedStatus === "OPEN" ? Boolean(trade?.excursion) : current;
    if (!current) missing++;
    if (!showable || !trade?.excursion || !trade.excursionAt) continue;
    results.push({
      ...(trade.excursion as unknown as ExcursionResult),
      // Relabelled freely, and not part of the key - always the trade's own.
      symbol: row.symbol,
      setup: row.setup,
      measuredAt: trade.excursionAt.toISOString(),
    });
  }

  return { results, years, missing };
}

/**
 * IST day spans the trades need, with overlapping ones merged so positions
 * held at the same time share one pull. Each span starts a day early when the
 * stored entry is before 05:30 IST - a time stored 5h30m late then belongs to
 * the previous session. Open positions run to today.
 */
function daySpans(rows: GroupedTradeRow[]) {
  const spans = rows
    .map((row) => {
      const entryAt = row.entryLegs[0]?.dateTime.getTime() ?? 0;
      const exitAt =
        row.derivedStatus === "CLOSED" && row.exitDateTime ? row.exitDateTime.getTime() : Date.now();
      return {
        from: toIstDateString(new Date(entryAt - IST_OFFSET_MS)),
        to: toIstDateString(new Date(exitAt)),
      };
    })
    .sort((a, b) => a.from.localeCompare(b.from));

  const merged: { from: string; to: string }[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.from <= shiftDateString(last.to, 1)) {
      if (span.to > last.to) last.to = span.to;
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

async function pullBars(accessToken: string, scrip: ScripRow, rows: GroupedTradeRow[]) {
  const bars: PriceBar[] = [];
  for (const span of daySpans(rows)) {
    bars.push(...(await fetchMinuteBars(accessToken, scrip, span.from, span.to)));
  }
  return bars;
}

/**
 * pending  closed trades not measured or changed since, plus every open one
 * open     open positions only - what an EOD price refresh moves
 */
export type RefreshScope = "pending" | "open";

/**
 * Measure on Dhan and store, one batch.
 *
 * Symbols are worked in sorted order and `after` is the last one finished, so a
 * trade stored in one batch dropping out of the list cannot shift the next
 * batch past a symbol. `next` is null once every symbol is done.
 */
export async function refreshExcursions({
  userId,
  accessToken,
  scope,
  after,
}: {
  userId: string;
  accessToken: string;
  scope: RefreshScope;
  after: string | null;
}) {
  const { rows, stored } = await loadPositions(userId);
  const todo = rows.filter(
    (row) => row.derivedStatus === "OPEN" || (scope === "pending" && !isCurrent(row, stored.get(row.id))),
  );

  const bySymbol = new Map<string, GroupedTradeRow[]>();
  for (const row of todo) {
    const key = row.symbol.trim().toUpperCase();
    const bucket = bySymbol.get(key);
    if (bucket) bucket.push(row);
    else bySymbol.set(key, [row]);
  }
  const symbols = [...bySymbol.keys()].sort().filter((symbol) => after === null || symbol > after);

  const problems: ExcursionProblem[] = [];
  if (symbols.length === 0) return { measured: 0, problems, remaining: 0, next: null as string | null };

  // Fail fast on a dead token before the first pull, not halfway through.
  if (after === null) await fetchDhanProfile(accessToken);
  const master = await getScripMaster();

  const started = Date.now();
  let measured = 0;
  let done = 0;

  for (const symbol of symbols) {
    if (done > 0 && Date.now() - started > BATCH_BUDGET_MS) break;
    done++;

    const positions = bySymbol.get(symbol)!;
    const scrip = lookupScrip(master, symbol);
    if (!scrip) {
      problems.push({ symbol, reason: "Not in Dhan's security list, so there are no minute bars to measure it on." });
      continue;
    }

    const quoteSymbol = toQuoteSymbolFromScrip(scrip);
    let bars: PriceBar[];
    try {
      bars = await pullBars(accessToken, scrip, positions);
    } catch (error) {
      // An account-level failure is the same for every symbol; let it end the run.
      if ((error as Error).name === "DhanAuthError" || (error as Error).name === "DhanDataAccessError") throw error;
      problems.push({ symbol, reason: `Dhan minute bars failed (${(error as Error).message}).`, quoteSymbol });
      continue;
    }
    if (bars.length === 0) {
      problems.push({ symbol, reason: "Dhan returned no minute bars for this hold window.", quoteSymbol });
      continue;
    }

    const measuredAt = new Date();
    await prisma.$transaction(
      positions.map((row) =>
        prisma.trade.update({
          where: { id: row.id },
          data: {
            excursion: { ...computeExcursion(row, bars), quoteSymbol } as unknown as Prisma.InputJsonValue,
            excursionKey: excursionKey(row),
            excursionAt: measuredAt,
          },
        }),
      ),
    );
    measured += positions.length;
  }

  const remaining = symbols.length - done;
  return {
    measured,
    problems,
    remaining,
    next: remaining > 0 ? symbols[done - 1] : null,
  };
}
