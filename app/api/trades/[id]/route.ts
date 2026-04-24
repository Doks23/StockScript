import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  calculateTradeMetrics,
  normalizeTradePayload,
  tradePayloadSchema,
} from "@/lib/trade-utils";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireActiveUser();
    const json = await request.json();
    const parsed = tradePayloadSchema.parse(json);
    const payload = normalizeTradePayload(parsed);
    const metrics = calculateTradeMetrics(payload);

    const existingTrade = await prisma.trade.findUnique({
      where: { id: params.id, userId: user.id },
    });
    if (!existingTrade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    if (payload.competitionId) {
      const participant = await prisma.competitionParticipant.findUnique({
        where: {
          competitionId_userId: { competitionId: payload.competitionId, userId: user.id },
        },
      });
      if (!participant) {
        return NextResponse.json(
          { error: "Join the competition before posting a competition trade." },
          { status: 400 }
        );
      }
    }

    const txPayload = payload.transactions.map((t, i) => ({
      type: t.type,
      price: t.price,
      quantity: t.quantity,
      dateTime: new Date(t.dateTime),
      order: i,
    }));

    // Auto-detect tradeType from first chronological transaction
    const sortedByDate = [...txPayload].sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
    const derivedTradeType = sortedByDate[0]?.type === "BUY" ? "LONG" : "SHORT";
    const entryType = derivedTradeType === "LONG" ? "BUY" : "SELL";
    const exitType = derivedTradeType === "LONG" ? "SELL" : "BUY";

    const entryTxns = txPayload.filter((t) => t.type === entryType).sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
    const firstEntryAt = entryTxns.length > 0 ? entryTxns[0].dateTime : new Date();

    const totalEntryQ = txPayload.filter((t) => t.type === entryType).reduce((s, t) => s + t.quantity, 0);
    const totalExitQ = txPayload.filter((t) => t.type === exitType).reduce((s, t) => s + t.quantity, 0);
    const derivedStatus = totalExitQ >= totalEntryQ ? "CLOSED" : payload.status;

    // Replace all transactions atomically
    const trade = await prisma.$transaction(async (tx) => {
      await tx.transaction.deleteMany({ where: { tradeId: existingTrade.id } });

      return tx.trade.update({
        where: { id: existingTrade.id },
        data: {
          competitionId: payload.competitionId ?? null,
          symbol: payload.symbol,
          segment: payload.segment,
          tradeType: derivedTradeType,
          status: derivedStatus,
          tags: payload.tags,
          notes: payload.notes,
          charges: payload.charges,
          closingPrice: payload.closingPrice ?? null,
          stopLoss: payload.stopLoss ?? null,
          capitalUsed: metrics.capitalUsed,
          netPnl: metrics.realizedPnl,
          firstEntryAt,
          lockedAt: derivedStatus === "CLOSED" ? new Date() : null,
          transactions: { create: txPayload },
        },
        include: {
          transactions: { orderBy: { dateTime: "asc" } },
          images: true,
          competition: true,
          user: true,
        },
      });
    });

    return NextResponse.json({ trade });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update trade." },
      { status: 400 }
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireActiveUser();

    const existingTrade = await prisma.trade.findUnique({
      where: { id: params.id, userId: user.id },
    });
    if (!existingTrade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    await prisma.trade.delete({ where: { id: existingTrade.id } });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete trade." },
      { status: 400 }
    );
  }
}
