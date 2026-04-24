import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

    // Primary trade = earliest firstEntryAt
    const sorted = [...trades].sort(
      (a, b) => (a.firstEntryAt?.getTime() ?? 0) - (b.firstEntryAt?.getTime() ?? 0)
    );
    const primary = sorted[0];
    const secondaryIds = sorted.slice(1).map((t) => t.id);

    // All transactions from all trades, chronologically
    const allTxns = trades
      .flatMap((t) => t.transactions)
      .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());

    // Auto-derive tradeType from first transaction
    const derivedTradeType = allTxns[0]?.type === "BUY" ? "LONG" : "SHORT";
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
    const openQty = Math.max(0, totalEntryQty - totalExitQty);
    const derivedStatus = openQty <= 0 ? "CLOSED" : "OPEN";
    const charges = trades.reduce((s, t) => s + (t.charges || 0), 0);

    const pnlQty = totalExitQty > 0 ? totalExitQty : totalEntryQty;
    const grossPnl = derivedTradeType === "LONG"
      ? (weightedExit - weightedEntry) * pnlQty
      : (weightedEntry - weightedExit) * pnlQty;
    const netPnl = derivedStatus === "CLOSED" ? grossPnl - charges : 0;

    const firstEntryAt = entryTxns.length > 0
      ? new Date(Math.min(...entryTxns.map((t) => new Date(t.dateTime).getTime())))
      : primary.firstEntryAt;

    await prisma.$transaction(async (tx) => {
      // Delete secondary trades (transactions cascade)
      await tx.trade.deleteMany({ where: { id: { in: secondaryIds } } });
      // Remove primary's existing transactions
      await tx.transaction.deleteMany({ where: { tradeId: primary.id } });
      // Update primary with merged data
      await tx.trade.update({
        where: { id: primary.id },
        data: {
          tradeType: derivedTradeType,
          status: derivedStatus,
          capitalUsed,
          netPnl,
          charges,
          firstEntryAt,
          lockedAt: derivedStatus === "CLOSED" ? new Date() : null,
          transactions: {
            create: allTxns.map((t, i) => ({
              type: t.type,
              price: t.price,
              quantity: t.quantity,
              dateTime: t.dateTime,
              order: i,
            })),
          },
        },
      });
    });

    return NextResponse.json({ merged: true, primaryId: primary.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to merge trades." },
      { status: 400 }
    );
  }
}
