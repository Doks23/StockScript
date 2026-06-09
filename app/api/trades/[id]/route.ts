import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import {
  calculateTradeMetrics,
  normalizeTradePayload,
  tradePayloadSchema,
  deriveTradeTypeAndStatus,
} from "@/lib/trade-utils";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireActiveUser();
    const json = await request.json();
    const parsed = tradePayloadSchema.parse(json);
    const payload = normalizeTradePayload(parsed);

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

    const { tradeType: derivedTradeType, firstEntryAt, status: derivedStatus } =
      deriveTradeTypeAndStatus(txPayload);

    // Compute metrics using the derived status so netPnl is correct regardless
    // of what the user picked in the status dropdown.
    const metrics = calculateTradeMetrics({ ...payload, status: derivedStatus });

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
          setup: payload.setup,
          planFollowed: payload.planFollowed,
          exitTrigger: payload.exitTrigger,
          proficiency: payload.proficiency,
          growthAreas: payload.growthAreas,
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
    return handleApiError(error, "Unable to update trade.");
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
    return handleApiError(error, "Unable to delete trade.");
  }
}
