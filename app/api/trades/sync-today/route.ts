/**
 * POST /api/trades/sync-today
 * ─────────────────────────────────────────────────────────────────────
 * Same-day sync from Dhan's live trade book, so today's fills show their
 * impact immediately instead of waiting for the end-of-day statement.
 *
 * Independent of /api/trades/sync-dhan. Different API, different module,
 * different route, different source tag. Neither one's behaviour changes when
 * the other runs, with one deliberate point of contact: both derive a fill's
 * identity from the same content fingerprint, so whichever runs second
 * recognises what the first already wrote.
 *
 * What is different from the EOD sync, and why:
 *
 *  - Fills attach to the open position. Selling 100 of a 238-share holding is
 *    a scale-out, not a new short. The EOD sync creates a separate SHORT trade
 *    and asks you to merge it; that is fine for history but useless for seeing
 *    today's impact, which is the entire point of this route.
 *  - Symbols come from Dhan's scrip master. The live API says "DECNGOLD"; the
 *    journal says "DECCAN GOLD MINES".
 *  - Charges are 0 until the statement publishes them. See ./charges.
 *
 * Safety: dry run by default, one transaction for the whole write, every fill
 * de-duplicated by fingerprint, token used in memory and never stored.
 * ─────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { invalidateUserTrades } from "@/lib/cache";
import { buildTradesFromTransactions } from "@/lib/trade-matcher";
import type { RawTransaction } from "@/lib/trade-matcher";
import { calculateTradeMetrics, deriveTradeTypeAndStatus } from "@/lib/trade-utils";
import type { SegmentValue } from "@/lib/trade-utils";
import { ScripMasterError } from "@/lib/brokers/dhan-scrip-master";
import type { ScripMaster } from "@/lib/brokers/dhan-scrip-master";
import {
  DhanTodayAuthError,
  DhanTodayError,
  TODAY_SOURCE,
  fetchAndMapToday,
  fetchTodayOrders,
  fetchTodayProfile,
} from "@/lib/brokers/dhan-today";
import type { MappedTodayFill } from "@/lib/brokers/dhan-today";

/** The scrip master download dominates a cold run; the API calls are small. */
export const maxDuration = 120;

/** Marks a leg that already exists in the journal while it passes through the matcher. */
const EXISTING_REF = "existing:";

type LegPlan = {
  type: "BUY" | "SELL";
  price: number;
  quantity: number;
  dateTime: Date;
  order: number;
  externalTradeId: string | null;
  externalOrderId: string | null;
  source: string;
  /** True for fills this run is adding, which is what the preview counts. */
  isNew: boolean;
};

type PlannedAction =
  | {
      kind: "attach";
      tradeId: string;
      symbol: string;
      segment: SegmentValue;
      newLegs: number;
      legs: LegPlan[];
      status: "OPEN" | "CLOSED";
      tradeType: "LONG" | "SHORT";
      firstEntryAt: Date;
      openQty: number;
      capitalUsed: number;
      netPnl: number;
      charges: number;
      lockedAt: Date | null;
    }
  | {
      kind: "create";
      symbol: string;
      segment: SegmentValue;
      newLegs: number;
      legs: LegPlan[];
      status: "OPEN" | "CLOSED";
      tradeType: "LONG" | "SHORT";
      firstEntryAt: Date;
      openQty: number;
      capitalUsed: number;
      netPnl: number;
      charges: number;
    };

/** Net open quantity implied by a set of legs. */
function openQuantity(legs: { type: string; quantity: number }[]): number {
  return legs.reduce(
    (net, leg) => net + (leg.type === "BUY" ? leg.quantity : -leg.quantity),
    0,
  );
}

/** Nominal capital: weighted entry price × total entry quantity. */
function nominalCapital(
  legs: { type: string; price: number; quantity: number }[],
  tradeType: "LONG" | "SHORT",
): number {
  const entryType = tradeType === "LONG" ? "BUY" : "SELL";
  const entries = legs.filter((leg) => leg.type === entryType);
  const qty = entries.reduce((sum, leg) => sum + leg.quantity, 0);
  if (qty <= 0) return 0;
  const value = entries.reduce((sum, leg) => sum + leg.price * leg.quantity, 0);
  return Math.abs(value);
}

export async function POST(request: Request) {
  try {
    const user = await requireActiveUser();

    const body = (await request.json().catch(() => ({}))) as {
      accessToken?: string;
      commit?: boolean;
      competitionId?: string;
    };

    const accessToken = (body.accessToken ?? "").trim();
    if (!accessToken) {
      return NextResponse.json({ error: "Dhan access token is required." }, { status: 400 });
    }

    const commit = body.commit === true;
    const competitionId = body.competitionId?.trim() || null;

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

    // 1. Dead token fails here rather than halfway through.
    const profile = await fetchTodayProfile(accessToken);

    // 2. Live fills, mapped onto journal symbols via the scrip master.
    const { mapped, skippedNonEquity, unmappedSymbols, errors, fills, warnings, master } =
      await fetchAndMapToday(accessToken);

    // 3. The order book is reporting only - it tells you what today looked like
    //    on the Orders screen, including the orders that never filled.
    const orders = await fetchTodayOrders(accessToken).catch(() => []);
    const orderCounts = orders.reduce(
      (counts, order) => {
        const status = (order.orderStatus ?? "").toUpperCase();
        if (status === "TRADED") counts.traded++;
        else if (status === "PART_TRADED") counts.partTraded++;
        else if (status === "CANCELLED") counts.cancelled++;
        else if (status === "REJECTED") counts.rejected++;
        else counts.other++;
        return counts;
      },
      { traded: 0, partTraded: 0, cancelled: 0, rejected: 0, other: 0 },
    );

    if (unmappedSymbols.length > 0) {
      warnings.push(
        `${unmappedSymbols.length} symbol(s) are not in Dhan's scrip master (${unmappedSymbols.join(", ")}). ` +
          `They were journalled under their exchange ticker, which will not match an existing journal row for the same company. Check those before importing.`,
      );
    }

    // 4. Drop fills already in the journal - from an earlier run of this sync,
    //    or from the EOD sync having already covered today.
    const incomingKeys = mapped.map((item) => item.dedupeKey);
    const alreadyStored = incomingKeys.length
      ? await prisma.transaction.findMany({
          where: { trade: { userId: user.id }, externalTradeId: { in: incomingKeys } },
          select: { externalTradeId: true },
        })
      : [];
    const storedKeys = new Set(
      alreadyStored.map((row) => row.externalTradeId).filter((id): id is string => Boolean(id)),
    );
    const fresh = mapped.filter((item) => !storedKeys.has(item.dedupeKey));

    // 5. Group by symbol + segment. Delivery and intraday fills for one symbol
    //    are separate positions; netting them would close a holding on paper.
    //    Keyed on a tab, because journal symbols contain spaces.
    const groups = new Map<
      string,
      { symbol: string; segment: SegmentValue; items: MappedTodayFill[] }
    >();
    for (const item of fresh) {
      const key = `${item.transaction.ticker}\t${item.segment}`;
      const bucket = groups.get(key);
      if (bucket) bucket.items.push(item);
      else
        groups.set(key, {
          symbol: item.transaction.ticker,
          segment: item.segment,
          items: [item],
        });
    }

    // 6. Load candidate trades for exactly those symbols. Locked trades are
    //    loaded too, purely so a locked position can be reported rather than
    //    silently bypassed into a second trade for the same holding.
    const symbols = [...new Set(fresh.map((item) => item.transaction.ticker))];
    const candidates = symbols.length
      ? await prisma.trade.findMany({
          where: { userId: user.id, competitionId, symbol: { in: symbols } },
          include: { transactions: { orderBy: { dateTime: "asc" } } },
          orderBy: { firstEntryAt: "asc" },
        })
      : [];

    const actions: PlannedAction[] = [];
    const capitalKept: string[] = [];

    for (const { symbol, segment, items } of groups.values()) {

      // The open position to scale into or out of. Oldest first, so a
      // scale-out lands on the position you would actually be closing.
      const open = candidates.filter(
        (trade) =>
          trade.symbol === symbol &&
          trade.segment === segment &&
          Math.abs(openQuantity(trade.transactions)) > 0.0001,
      );

      const lockedOpen = open.filter((trade) => trade.lockedAt !== null);
      const attachable = open.filter((trade) => trade.lockedAt === null);

      if (lockedOpen.length > 0 && attachable.length === 0) {
        warnings.push(
          `${symbol} (${segment}) has an open position that is locked, so today's fills could not be attached to it and came through as a separate trade. Unlock it and re-run if they belong together.`,
        );
      }

      if (attachable.length > 1) {
        warnings.push(
          `${symbol} (${segment}) has ${attachable.length} open trades. Today's fills were attached to the oldest one, opened ${attachable[0].firstEntryAt?.toDateString() ?? "earlier"}. Move them in the journal if that is the wrong position.`,
        );
      }

      const target = attachable[0] ?? null;

      // Existing legs carry a ref so their broker ids and provenance survive
      // the round trip through the matcher, which returns legs stripped of
      // everything except the fields it uses.
      const existingByRef = new Map<
        string,
        (typeof candidates)[number]["transactions"][number]
      >();

      const existingLegs: RawTransaction[] = (target?.transactions ?? []).map((leg) => {
        const ref = `${EXISTING_REF}${leg.id}`;
        existingByRef.set(ref, leg);
        return {
          ticker: symbol,
          date: leg.dateTime,
          type: leg.type as "BUY" | "SELL",
          price: leg.price,
          quantity: leg.quantity,
          ref,
        };
      });

      const combined = [...existingLegs, ...items.map((item) => item.transaction)];
      const orderIdByRef = new Map(items.map((item) => [item.dedupeKey, item.externalOrderId]));

      // Re-running the matcher over the whole position handles the case the
      // naive "append and recompute" cannot: a day that closes the holding and
      // re-enters produces two trades, not one trade with a zero crossing in
      // the middle.
      const rebuilt = buildTradesFromTransactions(combined);

      rebuilt.forEach((trade, index) => {
        const legs: LegPlan[] = trade.transactions.map((leg, position) => {
          const ref = leg.ref ?? "";
          const priorLeg = ref.startsWith(EXISTING_REF) ? existingByRef.get(ref) : undefined;

          return {
            type: leg.type,
            price: leg.price,
            quantity: leg.quantity,
            dateTime: leg.date,
            order: position,
            externalTradeId: priorLeg ? priorLeg.externalTradeId : ref || null,
            externalOrderId: priorLeg
              ? priorLeg.externalOrderId
              : (orderIdByRef.get(ref) ?? null),
            source: priorLeg ? priorLeg.source : TODAY_SOURCE,
            isNew: !priorLeg,
          };
        });

        const newLegs = legs.filter((leg) => leg.isNew).length;
        const attachHere = target !== null && index === 0;

        // Nothing of today's landed here and there is no existing trade to
        // rewrite, so there is nothing to do. The attach case is never skipped:
        // it owns the delete-and-recreate of the target's legs, and skipping it
        // would leave those legs on the old trade *and* on a split-off one.
        if (newLegs === 0 && !attachHere) return;

        const { tradeType, status, firstEntryAt } = deriveTradeTypeAndStatus(legs);

        // Charges live on the trade, not the leg, and today's fills bring none.
        // An attached trade keeps what it already had; a split-off re-entry
        // starts at zero rather than inheriting costs it did not incur.
        const charges = attachHere ? target.charges : 0;

        const metrics = calculateTradeMetrics({
          tradeType,
          status,
          charges,
          transactions: legs.map((leg) => ({
            type: leg.type,
            price: leg.price,
            quantity: leg.quantity,
          })),
        });

        // Recompute capital only when the stored figure was the one this app
        // derives. A hand-entered capitalUsed is a deliberate statement about
        // the position and is not this sync's to overwrite.
        let capitalUsed = nominalCapital(legs, tradeType);
        if (attachHere) {
          const priorType = deriveTradeTypeAndStatus(target.transactions).tradeType;
          const priorNominal = nominalCapital(target.transactions, priorType);
          const wasDerived = Math.abs(target.capitalUsed - priorNominal) < 0.01;
          if (!wasDerived && target.capitalUsed > 0) {
            capitalUsed = target.capitalUsed;
            capitalKept.push(target.symbol);
          }
        }

        const shared = {
          symbol,
          segment,
          newLegs,
          legs,
          status,
          tradeType,
          firstEntryAt,
          openQty: Math.abs(openQuantity(legs)),
          capitalUsed,
          netPnl: metrics.realizedPnl,
          charges,
        };

        actions.push(
          attachHere
            ? {
                kind: "attach",
                tradeId: target.id,
                ...shared,
                lockedAt: status === "CLOSED" ? new Date() : null,
              }
            : { kind: "create", ...shared },
        );
      });
    }

    if (capitalKept.length > 0) {
      warnings.push(
        `Capital used was left as you set it on ${[...new Set(capitalKept)].join(", ")}, so allocation % there will not reflect today's added quantity.`,
      );
    }

    const newShorts = actions.filter(
      (action) => action.kind === "create" && action.tradeType === "SHORT",
    );
    if (newShorts.length > 0) {
      warnings.push(
        `${newShorts.length} sell(s) had no open position to attach to (${[...new Set(newShorts.map((a) => a.symbol))].join(", ")}) and came through as new SHORT trades. If that stock was bought before today, the buy is missing from the journal - run the full Dhan sync for the entry date first.`,
      );
    }

    const attachCount = actions.filter((action) => action.kind === "attach").length;
    const createCount = actions.filter((action) => action.kind === "create").length;

    const summary = {
      dryRun: !commit,
      dhanClientId: profile.dhanClientId ?? null,
      tokenValidity: profile.tokenValidity ?? null,
      fetchedFills: fills.length,
      skippedNonEquity,
      skippedAlreadyStored: storedKeys.size,
      newFills: fresh.length,
      attachedTrades: attachCount,
      createdTrades: createCount,
      orderCounts,
      unmappedSymbols,
      preview: actions.slice(0, 50).map((action) => ({
        kind: action.kind,
        symbol: action.symbol,
        segment: action.segment,
        tradeType: action.tradeType,
        status: action.status,
        newLegs: action.newLegs,
        totalLegs: action.legs.length,
        openQty: Number(action.openQty.toFixed(2)),
        netPnl: Number(action.netPnl.toFixed(2)),
      })),
      parseErrors: errors,
      warnings,
    };

    if (!commit) {
      return NextResponse.json({ ...summary, applied: 0 }, { status: 200 });
    }

    if (actions.length === 0) {
      return NextResponse.json({ ...summary, applied: 0 }, { status: 200 });
    }

    // 7. One transaction for everything. A half-applied sync would leave a
    //    position showing quantity it does not hold.
    await prisma.$transaction(
      async (tx) => {
        const tradeCount = await tx.trade.count({ where: { userId: user.id } });
        let rowIndex = tradeCount;

        for (const action of actions) {
          if (action.kind === "attach") {
            // Legs are rewritten rather than appended because `order` is
            // positional across the whole trade, and a fill reported late can
            // land in the middle of what is already stored.
            await tx.transaction.deleteMany({ where: { tradeId: action.tradeId } });
            await tx.transaction.createMany({
              data: action.legs.map((leg) => ({
                tradeId: action.tradeId,
                type: leg.type,
                price: leg.price,
                quantity: leg.quantity,
                dateTime: leg.dateTime,
                order: leg.order,
                externalTradeId: leg.externalTradeId,
                externalOrderId: leg.externalOrderId,
                source: leg.source,
              })),
            });
            await tx.trade.update({
              where: { id: action.tradeId },
              data: {
                tradeType: action.tradeType,
                status: action.status,
                firstEntryAt: action.firstEntryAt,
                capitalUsed: action.capitalUsed,
                netPnl: action.netPnl,
                lockedAt: action.lockedAt,
              },
            });
            continue;
          }

          rowIndex++;
          const created = await tx.trade.create({
            data: {
              userId: user.id,
              competitionId,
              symbol: action.symbol,
              segment: action.segment,
              tradeType: action.tradeType,
              status: action.status,
              rowIndex,
              tags: "",
              notes: "",
              charges: action.charges,
              capitalUsed: action.capitalUsed,
              netPnl: action.netPnl,
              firstEntryAt: action.firstEntryAt,
              lockedAt: action.status === "CLOSED" ? new Date() : null,
            },
            select: { id: true },
          });

          await tx.transaction.createMany({
            data: action.legs.map((leg) => ({
              tradeId: created.id,
              type: leg.type,
              price: leg.price,
              quantity: leg.quantity,
              dateTime: leg.dateTime,
              order: leg.order,
              externalTradeId: leg.externalTradeId,
              externalOrderId: leg.externalOrderId,
              source: leg.source,
            })),
          });
        }
      },
      { timeout: 60_000, maxWait: 15_000 },
    );

    // 8. The master is already in memory and knows every ticker, so symbols
    //    with no chart mapping get one for free. Existing mappings are never
    //    touched - a hand-set ticker outranks anything inferred here.
    const tickersAdded = await backfillTradingViewTickers(user.id, master);

    invalidateUserTrades(user.id);

    return NextResponse.json(
      { ...summary, dryRun: false, applied: actions.length, tickersAdded },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof DhanTodayAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof DhanTodayError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    if (error instanceof ScripMasterError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        {
          error:
            "Some of these fills are already in your journal, so nothing was applied. Preview again to see what is genuinely new.",
        },
        { status: 409 },
      );
    }
    return handleApiError(error, "Unable to sync today's trades from Dhan.");
  }
}

/**
 * Fill in TradingView tickers for journal symbols that have none.
 *
 * SymbolQuoteMap is also what the EOD price refresh reads, so this fixes
 * tomorrow's closing price for those symbols as well as the chart link. Only
 * exact company-name matches are written; a fuzzy guess here would point a
 * price at the wrong company, which is worse than no mapping at all.
 */
async function backfillTradingViewTickers(userId: string, master: ScripMaster) {
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

  const rows = symbols
    .map((row) => row.symbol.toUpperCase())
    .filter((symbol) => !known.has(symbol))
    .map((symbol) => ({ symbol, scrip: master.byJournalSymbol.get(symbol) }))
    .filter((entry): entry is { symbol: string; scrip: NonNullable<typeof entry.scrip> } =>
      Boolean(entry.scrip),
    )
    .map((entry) => ({
      userId,
      symbol: entry.symbol,
      quoteSymbol: `${entry.scrip.ticker}${entry.scrip.exchange === "BSE" ? ".BO" : ".NS"}`,
      displayName: entry.scrip.companyName || null,
    }));

  if (rows.length === 0) return 0;

  const result = await prisma.symbolQuoteMap.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}
