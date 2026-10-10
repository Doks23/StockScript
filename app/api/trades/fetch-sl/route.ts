/**
 * POST /api/trades/fetch-sl
 * ─────────────────────────────────────────────────────────────────────
 * Reads the algo's event ledger CSV and backfills the initial Stop Loss on
 * every journal trade that still has no SL. The journal is the source of
 * truth; the algo is the source of the number. Nothing else is copied over.
 *
 * Match key: symbol + first-entry calendar date (IST) + total entry quantity.
 * The algo trails the stop over the life of a trade, so the OLDEST
 * `stop_placed` event per key wins - that's the initial SL.
 *
 * Trades that already carry an SL are left alone. Trades with no match in
 * the CSV are reported back so the user can investigate.
 * ─────────────────────────────────────────────────────────────────────
 */

import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { invalidateUserTrades } from "@/lib/cache";

export const maxDuration = 60;

/**
 * Fixed path - the user keeps the algo backup here. Not configurable; if
 * the file isn't present we return a clear error rather than guessing.
 */
const CSV_PATH = "/Users/SaurabhD/Documents/DhanHq_backups/events_ledger_latest.csv";

type StopPlaced = {
  /** ISO timestamp from the ledger. Already carries +05:30 offset. */
  time: string;
  symbol: string;
  quantity: number;
  triggerPrice: number;
};

type MatchKey = string;
function keyFor(symbol: string, dateIst: string, qty: number): MatchKey {
  return `${symbol.toUpperCase()}|${dateIst}|${qty}`;
}

/**
 * Convert an ISO timestamp (which may carry any offset) to the IST calendar
 * date it falls on, formatted as YYYY-MM-DD. Date-only match is what the
 * user asked for; the ledger and journal both think in IST sessions.
 */
function toIstDate(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  // Shift into IST by adding 5h30m to the UTC epoch, then take the UTC date
  // parts - this avoids depending on the host TZ.
  const shifted = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Minimal RFC 4180 CSV parser. The ledger's `details` field is a JSON blob
 * wrapped in quotes with internal `"` escaped as `""`, so we need the real
 * quoting rules - a naive split breaks on the first comma inside the JSON.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (i + 1 < n && text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (c === "\n" || c === "\r") {
      // normalize CRLF / LF; swallow the pair
      if (c === "\r" && i + 1 < n && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      i += 1;
      continue;
    }

    field += c;
    i += 1;
  }

  // flush the trailing field / row if the file doesn't end on a newline
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * Walk the parsed ledger and index each `stop_placed` event by
 * symbol|IST-date|quantity. The FIRST row for a key is the initial SL - the
 * algo emits new `stop_placed` events as it trails, and those later rows
 * belong to a different number.
 *
 * The ledger has had two shapes over time:
 *   - Older (Sep 15, nested): details = { kind: "stop_placed",
 *       data: { symbol, quantity, trigger_price } }
 *   - Newer (Sep 18+, flat):   event column = "stop_placed",
 *       details = { qty, trigger, limit, order_id }
 * We accept both so a long ledger still parses end to end.
 */
function indexStopsFromCsv(csvText: string): Map<MatchKey, StopPlaced> {
  const rows = parseCsv(csvText);
  if (rows.length === 0) return new Map();

  const header = rows[0];
  const detailsIdx = header.indexOf("details");
  const timeIdx = header.indexOf("time");
  const symbolIdx = header.indexOf("symbol");
  const eventIdx = header.indexOf("event");
  if (detailsIdx < 0 || timeIdx < 0 || symbolIdx < 0 || eventIdx < 0) {
    throw new Error(
      `CSV header missing expected columns. Found: ${header.join(", ")}`,
    );
  }

  const index = new Map<MatchKey, StopPlaced>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const detailsRaw = row[detailsIdx];
    if (!detailsRaw) continue;

    let details: any;
    try {
      details = JSON.parse(detailsRaw);
    } catch {
      // Not valid JSON - skip quietly. The ledger has a few log-only rows.
      continue;
    }

    // Normalise both shapes into (symbol, quantity, triggerPrice).
    let symbol: string | undefined;
    let quantity: number | undefined;
    let triggerPrice: number | undefined;

    const isNewShape =
      row[eventIdx] === "stop_placed" && typeof details?.trigger !== "undefined";
    const isOldShape = details?.kind === "stop_placed" && details?.data;

    if (isNewShape) {
      symbol = row[symbolIdx] || undefined;
      quantity = Number(details.qty);
      triggerPrice = Number(details.trigger);
    } else if (isOldShape) {
      const d = details.data;
      symbol = typeof d.symbol === "string" ? d.symbol : row[symbolIdx];
      quantity = Number(d.quantity);
      triggerPrice = Number(d.trigger_price);
    } else {
      continue;
    }

    if (
      !symbol ||
      !Number.isFinite(quantity) ||
      !Number.isFinite(triggerPrice)
    ) {
      continue;
    }

    const time = row[timeIdx];
    const dateIst = toIstDate(time);
    const key = keyFor(symbol, dateIst, quantity!);

    const existing = index.get(key);
    if (
      !existing ||
      new Date(time).getTime() < new Date(existing.time).getTime()
    ) {
      // Keep the oldest - the first stop_placed is the initial SL. The algo
      // trails it later, which emits more rows with a tighter trigger.
      index.set(key, {
        time,
        symbol,
        quantity: quantity!,
        triggerPrice: triggerPrice!,
      });
    }
  }

  return index;
}

export async function POST(request: Request) {
  try {
    const user = await requireActiveUser();

    // Two-step flow:
    //   1. Default (no body / apply=false): preview the matches so the user
    //      can see Entry, Qty, SL, SL% in a table and tick the ones to apply.
    //   2. apply=true + tradeIds[]: recompute the matches server-side so the
    //      client can't inject an arbitrary SL, then write only the chosen ids.
    let apply = false;
    let chosenIds: Set<string> | null = null;
    // Journal filters piped through from the UI so Fetch SL only touches
    // the trades the user is currently looking at. All optional.
    let filterSymbol = "";
    let filterStatus: "OPEN" | "CLOSED" | "ALL" = "ALL";
    let filterFrom: string | null = null;
    let filterTo: string | null = null;
    try {
      const body = await request.json();
      apply = body?.apply === true;
      if (apply && Array.isArray(body?.tradeIds)) {
        chosenIds = new Set<string>(
          body.tradeIds.filter((id: unknown) => typeof id === "string"),
        );
      }
      const f = body?.filters;
      if (f && typeof f === "object") {
        if (typeof f.symbol === "string") filterSymbol = f.symbol.trim();
        if (f.status === "OPEN" || f.status === "CLOSED" || f.status === "ALL") {
          filterStatus = f.status;
        }
        if (typeof f.from === "string" && f.from) filterFrom = f.from;
        if (typeof f.to === "string" && f.to) filterTo = f.to;
      }
    } catch {
      // Empty body / not JSON - treat as preview with no filters.
    }

    // 1. Read CSV. Fail loudly if the file isn't present or readable - the
    //    user is the one who maintains this path, so a clear error is the
    //    right outcome (not a silent "0 matched").
    let csvText: string;
    try {
      csvText = await fs.readFile(CSV_PATH, "utf-8");
    } catch (e: any) {
      return NextResponse.json(
        {
          error: `Algo ledger not readable at ${CSV_PATH}. ${e?.message || ""}`,
        },
        { status: 400 },
      );
    }

    const stopIndex = indexStopsFromCsv(csvText);

    // 2. Candidate trades: user's own, SL still empty, narrowed by whatever
    //    filters are active on the journal (symbol / status / date range).
    //    firstEntryAt is the same column the journal filter uses.
    const where: any = {
      userId: user.id,
      OR: [{ stopLoss: null }, { stopLoss: 0 }],
    };
    if (filterSymbol) {
      where.symbol = { contains: filterSymbol, mode: "insensitive" };
    }
    if (filterStatus !== "ALL") {
      where.status = filterStatus;
    }
    if (filterFrom || filterTo) {
      where.firstEntryAt = {};
      if (filterFrom) where.firstEntryAt.gte = new Date(filterFrom);
      if (filterTo) {
        // Make "to" inclusive of the whole day.
        const to = new Date(filterTo);
        to.setHours(23, 59, 59, 999);
        where.firstEntryAt.lte = to;
      }
    }
    const trades = await prisma.trade.findMany({
      where,
      include: {
        transactions: true,
      },
    });

    // The journal stores full company names ("SUDARSHAN CHEMICAL INDUSTRIES"),
    // but the algo CSV uses Dhan trading symbols ("SUDARSCHEM"). This map is
    // the same one the journal UI uses to display the ticker column, so a
    // mapping saved there also lines up the SL lookup here. Fall back to the
    // raw journal symbol when no mapping exists - some tickers (CYIENT) match
    // on the nose.
    const mapRows = await prisma.symbolQuoteMap.findMany({
      where: { userId: user.id },
      select: { symbol: true, quoteSymbol: true },
    });
    const tickerFor = new Map<string, string>();
    for (const row of mapRows) {
      // quoteSymbol is like "SUDARSCHEM.NS" / "SUDARSCHEM.BO" - strip the
      // exchange suffix to get the raw Dhan trading symbol.
      const ticker = row.quoteSymbol.replace(/\.(NS|BO)$/i, "").toUpperCase();
      tickerFor.set(row.symbol.toUpperCase(), ticker);
    }
    function algoTickerFor(journalSymbol: string): string {
      const key = journalSymbol.toUpperCase();
      return tickerFor.get(key) ?? key;
    }

    type MatchedRow = {
      tradeId: string;
      symbol: string;
      /** The Dhan ticker we matched against. Useful when it differs from symbol. */
      algoTicker: string;
      date: string;
      qty: number;
      /** Weighted average entry price - what the journal shows as "Entry". */
      entry: number;
      stopLoss: number;
      /** |SL - entry| / entry * 100. One decimal is good enough for display. */
      stopLossPct: number;
    };
    type UnmatchedRow = {
      tradeId: string;
      symbol: string;
      algoTicker: string;
      date: string | null;
      qty: number;
    };

    const matched: MatchedRow[] = [];
    const unmatched: UnmatchedRow[] = [];

    for (const trade of trades) {
      // Which transactions open the trade? LONG opens with BUY, SHORT with SELL.
      const entryType = trade.tradeType === "LONG" ? "BUY" : "SELL";
      const entries = trade.transactions
        .filter((t) => t.type === entryType)
        .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());

      if (entries.length === 0) {
        // No entry transactions means we have nothing to key on. Skip entirely
        // rather than report - the trade is incomplete, not unmatched.
        continue;
      }

      // Key off the FIRST entry transaction. A trade that adds a second
      // tranche on a later day (CYIENT 56 on Sep 30 + 53 on Oct 5) still
      // matches the algo's initial stop_placed from its first fill. Total-qty
      // matching would miss that case, since the CSV logs one stop per fill
      // and the user's trade aggregates fills in the journal.
      const firstEntry = entries[0];
      const firstEntryIst = toIstDate(firstEntry.dateTime);
      const firstEntryQty = firstEntry.quantity;
      const ticker = algoTickerFor(trade.symbol);
      const key = keyFor(ticker, firstEntryIst, firstEntryQty);

      const hit = stopIndex.get(key);
      if (!hit) {
        unmatched.push({
          tradeId: trade.id,
          symbol: trade.symbol,
          algoTicker: ticker,
          date: firstEntryIst,
          qty: firstEntryQty,
        });
        continue;
      }

      // Entry price for the SL% display is still the weighted average across
      // all fills - that's what the journal shows in its Entry column and
      // what makes stopLossPct comparable with the rest of the table.
      const totalEntryQty = entries.reduce((s, t) => s + t.quantity, 0);
      const notional = entries.reduce((s, t) => s + t.price * t.quantity, 0);
      const entryPrice = totalEntryQty > 0 ? notional / totalEntryQty : 0;
      const slPct =
        entryPrice > 0
          ? Math.abs((hit.triggerPrice - entryPrice) / entryPrice) * 100
          : 0;

      matched.push({
        tradeId: trade.id,
        symbol: trade.symbol,
        algoTicker: ticker,
        date: firstEntryIst,
        qty: firstEntryQty,
        entry: entryPrice,
        stopLoss: hit.triggerPrice,
        stopLossPct: slPct,
      });
    }

    // 3. Apply (only if the client asked to and listed which trades). Each
    //    updateMany scopes on userId so a stray tradeId can't touch another
    //    user's row.
    let applied = 0;
    if (apply && matched.length > 0) {
      const toWrite = chosenIds
        ? matched.filter((m) => chosenIds!.has(m.tradeId))
        : matched;
      if (toWrite.length > 0) {
        await prisma.$transaction(
          toWrite.map((m) =>
            prisma.trade.updateMany({
              where: { id: m.tradeId, userId: user.id },
              data: { stopLoss: m.stopLoss },
            }),
          ),
        );
        invalidateUserTrades(user.id);
        applied = toWrite.length;
      }
    }

    return NextResponse.json({
      mode: apply ? "apply" : "preview",
      csvRows: stopIndex.size,
      candidateTrades: trades.length,
      matched,
      unmatched,
      applied,
    });
  } catch (error) {
    return handleApiError(error, "Unable to fetch SL from algo.");
  }
}
