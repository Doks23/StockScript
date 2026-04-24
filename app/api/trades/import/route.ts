import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { csvToTransactions, parseCSVText, detectBrokerProfile, BROKER_PROFILES } from "@/lib/csv-parser";
import { buildTradesFromTransactions } from "@/lib/trade-matcher";
import { calculateTradeMetrics } from "@/lib/trade-utils";

export async function POST(request: Request) {
  try {
    const user = await requireActiveUser();
    const json = await request.json();
    const { csvText, brokerKey, competitionId, segment } = json as {
      csvText: string;
      brokerKey?: string;
      competitionId?: string;
      segment?: string;
    };

    if (!csvText || csvText.trim().length === 0) {
      return NextResponse.json({ error: "CSV text is empty." }, { status: 400 });
    }

    const rows = parseCSVText(csvText);
    if (rows.length < 2) {
      return NextResponse.json(
        { error: "CSV must contain a header row and at least one data row." },
        { status: 400 }
      );
    }

    const detectedKey = brokerKey === "auto" || !brokerKey
      ? detectBrokerProfile(rows[0])
      : brokerKey;
    const profile = BROKER_PROFILES[detectedKey] || BROKER_PROFILES.generic;

    const { transactions, errors: parseErrors } = csvToTransactions(rows, profile);

    if (transactions.length === 0) {
      return NextResponse.json(
        { error: "No valid transactions found in CSV.", parseErrors },
        { status: 400 }
      );
    }

    const matchedTrades = buildTradesFromTransactions(transactions);

    if (matchedTrades.length === 0) {
      return NextResponse.json(
        { error: "No trades could be matched from the transactions." },
        { status: 400 }
      );
    }

    if (competitionId) {
      const participant = await prisma.competitionParticipant.findUnique({
        where: { competitionId_userId: { competitionId, userId: user.id } },
      });
      if (!participant) {
        return NextResponse.json(
          { error: "Join the competition before importing competition trades." },
          { status: 400 }
        );
      }
    }

    const currentCount = await prisma.trade.count({ where: { userId: user.id } });

    const createdTrades = [];
    let rowIndex = currentCount;

    for (const matched of matchedTrades) {
      rowIndex++;

      const txPayload = matched.transactions.map((t, i) => ({
        type: t.type,
        price: t.price,
        quantity: t.quantity,
        dateTime: t.date,
        order: i,
      }));

      const entryType = matched.tradeType === "LONG" ? "BUY" : "SELL";
      const entryTxns = txPayload
        .filter((t) => t.type === entryType)
        .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
      const firstEntryAt = entryTxns.length > 0 ? entryTxns[0].dateTime : new Date();

      const metrics = calculateTradeMetrics({
        tradeType: matched.tradeType,
        status: matched.status,
        transactions: matched.transactions.map((t) => ({
          type: t.type,
          price: t.price,
          quantity: t.quantity,
        })),
      });

      const trade = await prisma.trade.create({
        data: {
          userId: user.id,
          competitionId: competitionId || null,
          symbol: matched.ticker,
          segment: segment || "EQUITY",
          tradeType: matched.tradeType,
          status: matched.status,
          rowIndex,
          tags: "",
          notes: "",
          charges: 0,
          capitalUsed: metrics.capitalUsed,
          netPnl: metrics.realizedPnl,
          firstEntryAt,
          lockedAt: matched.status === "CLOSED" ? new Date() : null,
          transactions: { create: txPayload },
        },
      });

      createdTrades.push(trade);
    }

    return NextResponse.json(
      {
        imported: createdTrades.length,
        open: createdTrades.filter((t) => t.status === "OPEN").length,
        closed: createdTrades.filter((t) => t.status === "CLOSED").length,
        brokerDetected: profile.name,
        parseErrors: parseErrors.length > 0 ? parseErrors : undefined,
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to import trades." },
      { status: 400 }
    );
  }
}
