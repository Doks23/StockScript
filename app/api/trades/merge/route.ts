import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { invalidateUserTrades } from "@/lib/cache";
import { deriveTradeTypeAndStatus } from "@/lib/trade-utils";

type MergeTrade = Awaited<ReturnType<typeof prisma.trade.findMany>>[number];

function splitList(value?: string | null) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function combineList(values: Array<string | null>) {
  const seen = new Set<string>();
  const combined: string[] = [];

  for (const value of values) {
    for (const item of splitList(value)) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      combined.push(item);
    }
  }

  return combined.length > 0 ? combined.join(", ") : null;
}

function uniquePresent<T>(values: Array<T | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is T => value !== null && value !== undefined)));
}

function formatMetadataValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "empty";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function addConflictNote(
  notes: string[],
  label: string,
  values: unknown[],
  chosen: unknown,
) {
  if (values.length <= 1) return;
  notes.push(
    `${label} conflict during merge. Kept ${formatMetadataValue(chosen)}. Other values: ${values
      .map(formatMetadataValue)
      .join(", ")}.`,
  );
}

function firstPresent<T>(trades: MergeTrade[], selector: (trade: MergeTrade) => T | null | undefined) {
  for (const trade of trades) {
    const value = selector(trade);
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function combineNotes(trades: MergeTrade[], conflictNotes: string[]) {
  const noteBlocks = trades
    .map((trade) => trade.notes.trim())
    .filter(Boolean);

  if (conflictNotes.length > 0) {
    noteBlocks.push(["Merge metadata notes:", ...conflictNotes.map((note) => `- ${note}`)].join("\n"));
  }

  return Array.from(new Set(noteBlocks)).join("\n\n---\n\n");
}

export async function POST(request: Request) {
  try {
    const user = await requireActiveUser();
    const { ids } = await request.json();

    if (!Array.isArray(ids) || ids.length < 2) {
      return NextResponse.json({ error: "Select at least 2 trades to merge." }, { status: 400 });
    }

    const trades = await prisma.trade.findMany({
      where: { id: { in: ids }, userId: user.id },
      include: { transactions: { orderBy: { dateTime: "asc" } } },
    });

    if (trades.length !== ids.length) {
      return NextResponse.json({ error: "Some trades not found." }, { status: 404 });
    }

    const symbols = new Set(trades.map((t) => t.symbol));
    if (symbols.size > 1) {
      return NextResponse.json(
        { error: "All selected trades must have the same symbol." },
        { status: 400 }
      );
    }

    const segments = new Set(trades.map((t) => t.segment));
    if (segments.size > 1) {
      return NextResponse.json(
        { error: "All selected trades must have the same segment." },
        { status: 400 }
      );
    }

    const competitionIds = uniquePresent(trades.map((t) => t.competitionId));
    if (competitionIds.length > 1) {
      return NextResponse.json(
        { error: "Selected trades belong to different competitions. Remove the competition conflict before merging." },
        { status: 400 }
      );
    }

    const sorted = [...trades].sort(
      (a, b) => (a.firstEntryAt?.getTime() ?? 0) - (b.firstEntryAt?.getTime() ?? 0)
    );
    const primary = sorted[0];
    const secondaryIds = sorted.slice(1).map((t) => t.id);

    const allTxns = trades
      .flatMap((t) => t.transactions)
      .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

    const { tradeType: derivedTradeType, firstEntryAt, status: derivedStatus } =
      deriveTradeTypeAndStatus(allTxns);

    const entryType = derivedTradeType === "LONG" ? "BUY" : "SELL";
    const exitType = derivedTradeType === "LONG" ? "SELL" : "BUY";

    const entryTxns = allTxns.filter((t) => t.type === entryType);
    const exitTxns = allTxns.filter((t) => t.type === exitType);

    const totalEntryQty = entryTxns.reduce((s, t) => s + t.quantity, 0);
    const totalExitQty = exitTxns.reduce((s, t) => s + t.quantity, 0);

    const weightedEntry = totalEntryQty > 0
      ? entryTxns.reduce((s, t) => s + t.price * t.quantity, 0) / totalEntryQty : 0;
    const weightedExit = totalExitQty > 0
      ? exitTxns.reduce((s, t) => s + t.price * t.quantity, 0) / totalExitQty : 0;

    const capitalUsed = weightedEntry * totalEntryQty;
    const charges = trades.reduce((s, t) => s + (t.charges || 0), 0);

    const pnlQty = totalExitQty > 0 ? totalExitQty : totalEntryQty;
    const grossPnl = derivedTradeType === "LONG"
      ? (weightedExit - weightedEntry) * pnlQty
      : (weightedEntry - weightedExit) * pnlQty;
    const netPnl = derivedStatus === "CLOSED" ? grossPnl - charges : 0;
    const stopLoss = firstPresent(sorted, (trade) => trade.stopLoss);
    const closingPrice = derivedStatus === "OPEN"
      ? firstPresent([...sorted].reverse(), (trade) => trade.closingPrice)
      : null;
    const planFollowed = firstPresent(sorted, (trade) => trade.planFollowed);
    const avoidable = firstPresent(sorted, (trade) => trade.avoidable);
    const avoidableReason = avoidable
      ? firstPresent(sorted, (trade) => trade.avoidableReason)
      : null;

    const conflictNotes: string[] = [];
    addConflictNote(conflictNotes, "Stop loss", uniquePresent(trades.map((trade) => trade.stopLoss)), stopLoss);
    addConflictNote(conflictNotes, "Closing price", uniquePresent(trades.map((trade) => trade.closingPrice)), closingPrice);
    addConflictNote(conflictNotes, "Plan followed", uniquePresent(trades.map((trade) => trade.planFollowed)), planFollowed);

    await prisma.$transaction(async (tx) => {
      await tx.trade.deleteMany({ where: { id: { in: secondaryIds } } });
      await tx.transaction.deleteMany({ where: { tradeId: primary.id } });
      await tx.trade.update({
        where: { id: primary.id },
        data: {
          tradeType: derivedTradeType,
          status: derivedStatus,
          capitalUsed,
          netPnl,
          charges,
          firstEntryAt,
          competitionId: competitionIds[0] ?? null,
          tags: combineList(trades.map((t) => t.tags)) ?? "",
          notes: combineNotes(sorted, conflictNotes),
          setup: combineList(trades.map((t) => t.setup)),
          planFollowed,
          avoidable,
          avoidableReason,
          exitTrigger: combineList(trades.map((t) => t.exitTrigger)),
          proficiency: combineList(trades.map((t) => t.proficiency)),
          growthAreas: combineList(trades.map((t) => t.growthAreas)),
          stopLoss,
          closingPrice,
          lockedAt: derivedStatus === "CLOSED" ? new Date() : null,
          transactions: {
            create: allTxns.map((t, i) => ({
              type: t.type,
              price: t.price,
              quantity: t.quantity,
              dateTime: t.dateTime,
              order: i,
              // Broker provenance must survive the delete-and-recreate. Losing
              // it makes the fill invisible to the Dhan sync's duplicate check,
              // so the next sync would import it all over again.
              externalTradeId: t.externalTradeId,
              externalOrderId: t.externalOrderId,
              source: t.source,
            })),
          },
        },
      });
    });

    invalidateUserTrades(user.id);
    return NextResponse.json({ merged: true, primaryId: primary.id });
  } catch (error) {
    return handleApiError(error, "Unable to merge trades.");
  }
}
