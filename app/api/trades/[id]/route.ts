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
      include: { transactions: { orderBy: { order: "asc" } } },
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

    // The edit form posts plain legs with no broker fields, and the update below
    // deletes and recreates every transaction. Carry provenance across, or a
    // Dhan-synced fill silently reverts to source "MANUAL" with no
    // externalTradeId - and the next sync re-imports it as a new trade.
    //
    // Unchanged legs match exactly. Legs whose numbers the user edited fall
    // through to the leftovers pass, so an edited fill keeps its identity
    // instead of coming back as a duplicate.
    const provenanceKey = (t: { type: string; price: number; quantity: number; dateTime: Date }) =>
      `${t.type}|${t.price}|${t.quantity}|${t.dateTime.getTime()}`;

    const unclaimed = new Map<string, typeof existingTrade.transactions>();
    for (const row of existingTrade.transactions) {
      const key = provenanceKey(row);
      const bucket = unclaimed.get(key);
      if (bucket) bucket.push(row);
      else unclaimed.set(key, [row]);
    }

    const provenance: (typeof existingTrade.transactions[number] | undefined)[] = txPayload.map(
      (leg) => unclaimed.get(provenanceKey(leg))?.shift(),
    );

    const leftovers = [...unclaimed.values()].flat();
    for (let i = 0; i < provenance.length && leftovers.length > 0; i++) {
      if (!provenance[i]) provenance[i] = leftovers.shift();
    }

    const txCreate = txPayload.map((leg, i) => ({
      ...leg,
      externalTradeId: provenance[i]?.externalTradeId ?? null,
      externalOrderId: provenance[i]?.externalOrderId ?? null,
      source: provenance[i]?.source ?? "MANUAL",
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
          reviewed: payload.reviewed,
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
          transactions: { create: txCreate },
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
