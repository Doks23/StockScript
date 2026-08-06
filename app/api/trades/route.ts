import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { invalidateUserTrades } from "@/lib/cache";
import {
  calculateTradeMetrics,
  normalizeTradePayload,
  tradePayloadSchema,
  deriveTradeTypeAndStatus,
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

    const txPayload = payload.transactions.map((t, i) => ({
      type: t.type,
      price: t.price,
      quantity: t.quantity,
      dateTime: new Date(t.dateTime),
      order: i,
    }));

    const { tradeType: derivedTradeType, firstEntryAt, status: derivedStatus } =
      deriveTradeTypeAndStatus(txPayload);

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
        setup: payload.setup,
        planFollowed: payload.planFollowed,
        reviewed: payload.reviewed,
        exitTrigger: payload.exitTrigger,
        proficiency: payload.proficiency,
        growthAreas: payload.growthAreas,
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

    invalidateUserTrades(user.id);
    return NextResponse.json({ trade }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Unable to create trade.");
  }
}
