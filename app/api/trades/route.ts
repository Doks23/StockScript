import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  calculateTradeMetrics,
  normalizeTradePayload,
  tradePayloadSchema,
  getFirstEntryTime,
} from "@/lib/trade-utils";

export async function GET() {
  const user = await requireActiveUser();

  const trades = await prisma.trade.findMany({
    where: { userId: user.id },
    orderBy: { firstEntryAt: "desc" },
    include: {
      transactions: { orderBy: { dateTime: "asc" } },
      images: true,
      competition: true,
      user: true,
    },
  });

  return NextResponse.json({ trades });
}

export async function POST(request: Request) {
  try {
    const user = await requireActiveUser();
    const json = await request.json();
    const parsed = tradePayloadSchema.parse(json);
    const payload = normalizeTradePayload(parsed);
    const metrics = calculateTradeMetrics(payload);

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

    const previousCount = await prisma.trade.count({ where: { userId: user.id } });

    // Derive firstEntryAt from the first entry transaction (by date)
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

    // Auto-close if all entry qty is covered by exits
    const totalEntryQ = txPayload.filter((t) => t.type === entryType).reduce((s, t) => s + t.quantity, 0);
    const totalExitQ = txPayload.filter((t) => t.type === exitType).reduce((s, t) => s + t.quantity, 0);
    const derivedStatus = totalExitQ >= totalEntryQ ? "CLOSED" : payload.status;

    const trade = await prisma.trade.create({
      data: {
        userId: user.id,
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
        rowIndex: previousCount + 1,
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

    return NextResponse.json({ trade }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create trade." },
      { status: 400 }
    );
  }
}
