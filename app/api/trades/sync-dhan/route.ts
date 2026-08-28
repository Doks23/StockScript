/**
 * POST /api/trades/sync-dhan
 * ─────────────────────────────────────────────────────────────────────
 * Pulls equity fills from Dhan and creates trades, reusing the same
 * matcher / metrics / persistence logic as the CSV import.
 *
 * Safety design:
 *  - Dry run is the DEFAULT. Nothing is written unless `commit: true`.
 *  - Fills already stored (by Dhan exchangeTradeId) are skipped, so running
 *    this twice creates nothing the second time.
 *  - The whole write happens inside one prisma.$transaction, so a failure
 *    part way through leaves the journal untouched rather than half-written.
 *  - Every row written is tagged source = "DHAN_API" so the entire sync can
 *    be undone with a single delete.
 *  - The access token is used in-memory for this request only. It is never
 *    stored, logged, or returned. (The browser may keep it in localStorage for
 *    its 24-hour life; the server does not.)
 *  - The commit call may carry `selectedKeys`, the subset of previewed trades
 *    the user ticked. Absent means all of them.
 * ─────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { invalidateUserTrades } from "@/lib/cache";
import { buildTradesFromTransactions } from "@/lib/trade-matcher";
import { calculateTradeMetrics, deriveTradeTypeAndStatus } from "@/lib/trade-utils";
import type { SegmentValue } from "@/lib/trade-utils";
import {
  DhanApiError,
  DhanAuthError,
  fetchDhanFills,
  fetchDhanProfile,
  istToday,
  shiftDateString,
  toIstDateString,
  mapDhanFills,
} from "@/lib/brokers/dhan";
import type { MappedFill } from "@/lib/brokers/dhan";
import { getScripMaster } from "@/lib/brokers/dhan-scrip-master";
import {
  backfillTradingViewTickers,
  lookupScrip,
} from "@/lib/symbol-map-backfill";

/**
 * Fetching self-throttles to stay inside Dhan's rate limit, so a wide manual
 * range can take well past the default serverless timeout.
 */
export const maxDuration = 120;

/** Used only when the journal is empty and there is no date to work back from. */
const FIRST_RUN_DAYS = 90;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type PlannedTrade = {
  /** Stable across preview and commit, so the client can select rows by it. */
  key: string;
  symbol: string;
  segment: SegmentValue;
  tradeType: "LONG" | "SHORT";
  status: "OPEN" | "CLOSED";
  firstEntryAt: Date;
  charges: number;
  capitalUsed: number;
  netPnl: number;
  transactions: {
    type: "BUY" | "SELL";
    price: number;
    quantity: number;
    dateTime: Date;
    order: number;
    externalTradeId: string | null;
    externalOrderId: string | null;
  }[];
};

/**
 * Start date for the pull: the date of the newest trade in the journal.
 *
 * This mirrors the manual routine it replaces - read the last date, pull Dhan
 * from that day onward. Every source counts, not just previous Dhan syncs,
 * otherwise the first sync of a CSV-backed journal would ignore years of
 * history and re-pull FIRST_RUN_DAYS of trades already there.
 *
 * Starting *on* that date rather than the day after is deliberate. The
 * watermark is a timestamp but the Dhan API takes whole dates, so if the last
 * journal trade was 17 Jul 10:15 and another fill landed 17 Jul 14:30, starting
 * from the 18th would miss the afternoon fill permanently.
 *
 * There is no automatic pad below that date. Anything further back is a gap in
 * the journal rather than something this can infer, so it is left to the manual
 * from-date override.
 */
async function resolveWatermark(userId: string) {
  const latest = await prisma.transaction.findFirst({
    where: { trade: { userId } },
    orderBy: { dateTime: "desc" },
    select: { dateTime: true, source: true },
  });

  if (!latest) {
    return {
      fromDate: shiftDateString(istToday(), -FIRST_RUN_DAYS),
      basis: "first-run" as const,
      watermarkAt: null as Date | null,
      watermarkSource: null as string | null,
    };
  }

  return {
    fromDate: toIstDateString(latest.dateTime),
    basis: "watermark" as const,
    watermarkAt: latest.dateTime,
    watermarkSource: latest.source,
  };
}

export async function POST(request: Request) {
  try {
    const user = await requireActiveUser();

    const body = (await request.json().catch(() => ({}))) as {
      accessToken?: string;
      fromDate?: string;
      toDate?: string;
      commit?: boolean;
      competitionId?: string;
      selectedKeys?: unknown;
    };

    const accessToken = (body.accessToken ?? "").trim();
    if (!accessToken) {
      return NextResponse.json(
        { error: "Dhan access token is required." },
        { status: 400 },
      );
    }

    // Dry run unless explicitly told otherwise.
    const commit = body.commit === true;
    const competitionId = body.competitionId?.trim() || undefined;

    // Absent means "import everything in the preview", which is what the older
    // one-button flow sent. An explicit list means the user unticked rows.
    let selectedKeys: Set<string> | null = null;
    if (body.selectedKeys !== undefined) {
      if (
        !Array.isArray(body.selectedKeys) ||
        body.selectedKeys.some((key) => typeof key !== "string")
      ) {
        return NextResponse.json(
          { error: "selectedKeys must be an array of trade keys." },
          { status: 400 },
        );
      }
      selectedKeys = new Set(body.selectedKeys as string[]);
    }

    for (const [label, value] of [
      ["fromDate", body.fromDate],
      ["toDate", body.toDate],
    ] as const) {
      if (value && !DATE_RE.test(value)) {
        return NextResponse.json(
          { error: `${label} must be in YYYY-MM-DD format.` },
          { status: 400 },
        );
      }
    }

    if (competitionId) {
      const participant = await prisma.competitionParticipant.findUnique({
        where: { competitionId_userId: { competitionId, userId: user.id } },
      });
      if (!participant) {
        return NextResponse.json(
          { error: "Join the competition before syncing competition trades." },
          { status: 400 },
        );
      }
    }

    // 1. Fail fast on a dead token instead of 401-ing mid-pagination.
    //
    //    Dhan's published security list comes down alongside it - it is the
    //    only place the statement's company name ("DECCAN GOLD MINES") and the
    //    ticker TradingView charts ("DECNGOLD") appear together, so the preview
    //    can name rows the way the user reads them. It is cached for 12 hours,
    //    and a failed download only costs the ticker column, so it must never
    //    take the import down with it.
    const [profile, master] = await Promise.all([
      fetchDhanProfile(accessToken),
      getScripMaster().catch(() => null),
    ]);

    // 2. Work out the window.
    const watermark = await resolveWatermark(user.id);
    const fromDate = body.fromDate ?? watermark.fromDate;
    const toDate = body.toDate ?? istToday();

    if (fromDate > toDate) {
      return NextResponse.json(
        { error: `Start date (${fromDate}) is after end date (${toDate}).` },
        { status: 400 },
      );
    }

    // 3. Pull.
    const { fills, warnings } = await fetchDhanFills(accessToken, fromDate, toDate);
    const { mapped, skippedNonEquity, errors: mapErrors } = mapDhanFills(fills);

    // 4. Drop anything already stored. This is what makes the button safe to
    //    press repeatedly.
    const incomingIds = mapped
      .map((item) => item.externalTradeId)
      .filter((id): id is string => Boolean(id));

    const alreadyStored = incomingIds.length
      ? await prisma.transaction.findMany({
          where: { trade: { userId: user.id }, externalTradeId: { in: incomingIds } },
          select: { externalTradeId: true },
        })
      : [];

    const storedIds = new Set(
      alreadyStored
        .map((row) => row.externalTradeId)
        .filter((id): id is string => Boolean(id)),
    );

    const withoutId = mapped.filter((item) => !item.externalTradeId).length;
    const fresh = mapped.filter(
      (item) => item.externalTradeId && !storedIds.has(item.externalTradeId),
    );

    if (withoutId > 0) {
      warnings.push(
        `${withoutId} fill(s) had no exchangeTradeId and were skipped, because they cannot be de-duplicated safely.`,
      );
    }

    // Duplicate detection works off Dhan's own trade id, which only exists on
    // rows this sync wrote. When the newest journal trade came from a CSV or was
    // typed in, the overlap day cannot be de-duplicated automatically.
    if (
      !body.fromDate &&
      watermark.basis === "watermark" &&
      watermark.watermarkSource !== "DHAN_API" &&
      fresh.length > 0
    ) {
      warnings.push(
        `Your most recent journal trade was not created by this sync, so fills you already imported by CSV around ${toIstDateString(watermark.watermarkAt!)} cannot be detected as duplicates. Check the preview below before importing - from the next sync onward this is handled automatically.`,
      );
    }

    // 5. Build trades using the existing matcher, grouped by segment as well as
    //    symbol. The matcher only groups by ticker, so feeding it delivery and
    //    intraday fills for one symbol together lets an intraday round trip net
    //    against a delivery holding and silently close it.
    const bySegment = new Map<SegmentValue, MappedFill[]>();
    for (const item of fresh) {
      const bucket = bySegment.get(item.segment);
      if (bucket) bucket.push(item);
      else bySegment.set(item.segment, [item]);
    }

    // exchangeTradeId is unique per fill, so this lookup is collision-free -
    // unlike keying on the fill's contents, which two legs of one order share.
    const orderIdByTradeId = new Map<string, string | null>(
      fresh
        .filter((item) => item.externalTradeId)
        .map((item) => [item.externalTradeId as string, item.externalOrderId]),
    );

    const matched = [...bySegment.entries()].flatMap(([segment, items]) =>
      buildTradesFromTransactions(items.map((item) => item.transaction)).map(
        (trade) => ({ trade, segment }),
      ),
    );

    const planned: PlannedTrade[] = matched.map(({ trade, segment }) => {
      const txPayload = trade.transactions.map((leg, index) => ({
        type: leg.type,
        price: leg.price,
        quantity: leg.quantity,
        dateTime: leg.date,
        order: index,
        // Carried through the matcher on the leg itself.
        externalTradeId: leg.ref ?? null,
        externalOrderId: leg.ref ? (orderIdByTradeId.get(leg.ref) ?? null) : null,
      }));

      const { tradeType, firstEntryAt, status } = deriveTradeTypeAndStatus(txPayload);
      const charges = trade.transactions.reduce(
        (sum, leg) => sum + (leg.charges ?? 0),
        0,
      );
      const metrics = calculateTradeMetrics({
        tradeType,
        status,
        charges,
        transactions: txPayload.map((leg) => ({
          type: leg.type,
          price: leg.price,
          quantity: leg.quantity,
        })),
      });

      return {
        // exchangeTradeId is unique per fill, so the first leg names the trade
        // uniquely and identically on the preview call and the commit call.
        key:
          txPayload[0]?.externalTradeId ??
          `${segment}:${trade.ticker}:${firstEntryAt.toISOString()}`,
        symbol: trade.ticker,
        segment,
        tradeType,
        status,
        firstEntryAt,
        charges,
        capitalUsed: metrics.capitalUsed,
        netPnl: metrics.realizedPnl,
        transactions: txPayload,
      };
    });

    // Selection. The preview hands back a key per trade; a commit may send back
    // only the ones the user ticked, so everything below works on that subset.
    // A stale key - the fill got imported by another sync since the preview -
    // simply finds nothing rather than failing the whole import.
    const chosen = selectedKeys
      ? planned.filter((trade) => selectedKeys!.has(trade.key))
      : planned;

    if (selectedKeys) {
      const missing = selectedKeys.size - chosen.length;
      if (missing > 0) {
        warnings.push(
          `${missing} selected trade(s) are no longer in this sync - they were most likely imported since the preview - and were skipped.`,
        );
      }
      if (commit && chosen.length === 0) {
        return NextResponse.json(
          { error: "None of the selected trades are still available to import. Run the preview again." },
          { status: 400 },
        );
      }
    }

    // Flag exits whose entry sits outside this window - these are the ones
    // that need manual merging in the journal.
    const unmatchedExits = chosen
      .filter((trade) => trade.tradeType === "SHORT" && trade.status === "OPEN")
      .map((trade) => trade.symbol);

    if (unmatchedExits.length > 0) {
      warnings.push(
        `${unmatchedExits.length} sell(s) had no matching buy in this date range (${[...new Set(unmatchedExits)].join(", ")}). ` +
          `These came through as new SHORT trades. Either merge them with the existing open trade in the journal, ` +
          `or re-run the sync with the start date set to the original buy date.`,
      );
    }

    const summary = {
      dryRun: !commit,
      dhanClientId: profile.dhanClientId ?? null,
      tokenValidity: profile.tokenValidity ?? null,
      fromDate,
      toDate,
      dateBasis: watermark.basis,
      watermarkAt: watermark.watermarkAt,
      fetchedFills: fills.length,
      skippedNonEquity,
      skippedAlreadyStored: storedIds.size,
      newFills: fresh.length,
      plannedTrades: chosen.length,
      plannedOpen: chosen.filter((trade) => trade.status === "OPEN").length,
      plannedClosed: chosen.filter((trade) => trade.status === "CLOSED").length,
      // Every row, not a page of them: the client ticks rows to choose what to
      // import, and a truncated list would import trades nobody could see.
      preview: chosen.map((trade) => ({
        key: trade.key,
        symbol: trade.symbol,
        // Null when the master could not be read or the name is not in it -
        // the client falls back to the journal symbol rather than inventing a
        // ticker that would chart the wrong company.
        ticker: master ? (lookupScrip(master, trade.symbol)?.ticker ?? null) : null,
        segment: trade.segment,
        tradeType: trade.tradeType,
        status: trade.status,
        legs: trade.transactions.length,
        firstEntryAt: trade.firstEntryAt,
        charges: Number(trade.charges.toFixed(2)),
        netPnl: Number(trade.netPnl.toFixed(2)),
      })),
      parseErrors: mapErrors,
      warnings,
    };

    // 6. Dry run stops here, having written nothing.
    if (!commit) {
      return NextResponse.json({ ...summary, imported: 0 }, { status: 200 });
    }

    if (chosen.length === 0) {
      return NextResponse.json(
        { ...summary, imported: 0, open: 0, closed: 0 },
        { status: 200 },
      );
    }

    // 7. Commit. All or nothing - a partial write would let the watermark run
    //    ahead of what was actually saved and silently skip fills next time.
    //
    // Written as three bulk statements rather than one create per trade. The
    // database is remote, so a per-trade round trip put even a modest sync past
    // Prisma's 5s interactive transaction cap. Cost is now flat in trade count.
    const created = await prisma.$transaction(
      async (tx) => {
        const currentCount = await tx.trade.count({ where: { userId: user.id } });

        // createManyAndReturn preserves input order on PostgreSQL (one INSERT
        // ... RETURNING), so rows[i] is the trade built from chosen[i].
        const rows = await tx.trade.createManyAndReturn({
          data: chosen.map((trade, index) => ({
            userId: user.id,
            competitionId: competitionId || null,
            symbol: trade.symbol,
            segment: trade.segment,
            tradeType: trade.tradeType,
            status: trade.status,
            rowIndex: currentCount + index + 1,
            tags: "",
            notes: "",
            charges: trade.charges,
            capitalUsed: trade.capitalUsed,
            netPnl: trade.netPnl,
            firstEntryAt: trade.firstEntryAt,
            lockedAt: trade.status === "CLOSED" ? new Date() : null,
          })),
          select: { id: true },
        });

        await tx.transaction.createMany({
          data: chosen.flatMap((trade, index) =>
            trade.transactions.map((leg) => ({
              tradeId: rows[index].id,
              type: leg.type,
              price: leg.price,
              quantity: leg.quantity,
              dateTime: leg.dateTime,
              order: leg.order,
              externalTradeId: leg.externalTradeId,
              externalOrderId: leg.externalOrderId,
              source: "DHAN_API",
            })),
          ),
        });

        return rows.map((row) => row.id);
      },
      // Headroom for a wide first-run sync over a remote database. The work
      // itself is three statements, so this should never be approached.
      { timeout: 60_000, maxWait: 15_000 },
    );

    // The master is already in memory, so symbols with no chart mapping get
    // one for free - which fixes the EOD price refresh for them too, since it
    // reads the same rows. Hand-set mappings are never overwritten.
    const tickersAdded = master
      ? (await backfillTradingViewTickers(user.id, master)).added
      : 0;

    invalidateUserTrades(user.id);

    return NextResponse.json(
      {
        ...summary,
        dryRun: false,
        tickersAdded,
        imported: created.length,
        open: chosen.filter((trade) => trade.status === "OPEN").length,
        closed: chosen.filter((trade) => trade.status === "CLOSED").length,
        createdTradeIds: created,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof DhanAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof DhanApiError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    // The unique index on (externalTradeId, dateTime) caught a fill the
    // duplicate check missed - two syncs racing, most likely. Nothing was
    // written, because the whole import runs in one transaction.
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        {
          error:
            "Some of these fills are already in your journal, so nothing was imported. Run the preview again to see what is genuinely new.",
        },
        { status: 409 },
      );
    }
    return handleApiError(error, "Unable to sync trades from Dhan.");
  }
}
