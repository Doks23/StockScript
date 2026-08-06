import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { invalidateUserTrades } from "@/lib/cache";
import { csvToTransactions, parseCSVText, detectBrokerProfile, BROKER_PROFILES } from "@/lib/csv-parser";
import type { TradeSegment, TransactionType } from "@prisma/client";
import { buildTradesFromTransactions } from "@/lib/trade-matcher";
import { calculateTradeMetrics, deriveTradeTypeAndStatus } from "@/lib/trade-utils";
import { parseStockyMindWorkbook } from "@/lib/stockymind-parser";
import { parseKotakWorkbook } from "@/lib/kotak-parser";

export async function POST(request: Request) {
  try {
    const user = await requireActiveUser();
    const contentType = request.headers.get("content-type") || "";
    let competitionId: string | undefined;
    let segment: TradeSegment = "EQUITY";
    let detectedFormat = "Generic CSV";
    let parseErrors: string[] = [];
    let importTrades: {
      symbol: string;
      segment: TradeSegment;
      tradeType: "LONG" | "SHORT";
      status: "OPEN" | "CLOSED";
      transactions: {
        type: TransactionType;
        price: number;
        quantity: number;
        dateTime: Date;
        order: number;
      }[];
      charges: number;
      closingPrice?: number | null;
      stopLoss?: number | null;
      notes?: string;
      setup?: string | null;
      planFollowed?: boolean | null;
      exitTrigger?: string | null;
      proficiency?: string | null;
      growthAreas?: string | null;
    }[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      const brokerKey = String(formData.get("brokerKey") || "stockymind");
      competitionId = String(formData.get("competitionId") || "") || undefined;
      segment = (String(formData.get("segment") || "EQUITY") || "EQUITY") as TradeSegment;

      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Excel statement file is required." }, { status: 400 });
      }

      if (brokerKey === "kotak") {
        const parsed = parseKotakWorkbook(await file.arrayBuffer());
        parseErrors = parsed.errors;
        detectedFormat = "Kotak Securities Transaction Statement";

        if (parsed.transactions.length === 0) {
          return NextResponse.json(
            { error: "No valid transactions found in Kotak Excel statement.", parseErrors },
            { status: 400 }
          );
        }

        const matchedTrades = buildTradesFromTransactions(parsed.transactions);

        if (matchedTrades.length === 0) {
          return NextResponse.json(
            { error: "No trades could be matched from the Kotak transactions.", parseErrors },
            { status: 400 }
          );
        }

        importTrades = matchedTrades.map((matched) => ({
          symbol: matched.ticker,
          segment,
          tradeType: matched.tradeType,
          status: matched.status,
          transactions: matched.transactions.map((transaction, index) => ({
            type: transaction.type,
            price: transaction.price,
            quantity: transaction.quantity,
            dateTime: transaction.date,
            order: index,
          })),
          charges: matched.transactions.reduce(
            (sum, transaction) => sum + (transaction.charges ?? 0),
            0,
          ),
          notes: "",
        }));
      } else if (brokerKey === "stockymind" || brokerKey === "auto") {
        const parsed = parseStockyMindWorkbook(await file.arrayBuffer(), segment);
        parseErrors = parsed.errors;
        detectedFormat = "StockyMind Journal";
        importTrades = parsed.trades;
      } else {
        return NextResponse.json(
          { error: "Please select the correct broker for this Excel statement." },
          { status: 400 }
        );
      }

      if (importTrades.length === 0) {
        return NextResponse.json(
          { error: `No valid trades found in ${detectedFormat}.`, parseErrors },
          { status: 400 }
        );
      }
    } else {
      const json = await request.json();
      const { csvText, brokerKey } = json as {
        csvText: string;
        brokerKey?: string;
        competitionId?: string;
        segment?: string;
      };
      competitionId = json.competitionId;
      segment = (json.segment || "EQUITY") as TradeSegment;

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

      const { transactions, errors } = csvToTransactions(rows, profile);
      parseErrors = errors;

      if (transactions.length === 0) {
        return NextResponse.json(
          { error: "No valid transactions found in CSV.", parseErrors },
          { status: 400 }
        );
      }

      const matchedTrades = buildTradesFromTransactions(transactions);

      if (matchedTrades.length === 0) {
        return NextResponse.json(
          { error: "No trades could be matched from the transactions.", parseErrors },
          { status: 400 }
        );
      }

      detectedFormat = profile.name;
      importTrades = matchedTrades.map((matched) => ({
        symbol: matched.ticker,
        segment,
        tradeType: matched.tradeType,
        status: matched.status,
        transactions: matched.transactions.map((transaction, index) => ({
          type: transaction.type,
          price: transaction.price,
          quantity: transaction.quantity,
          dateTime: transaction.date,
          order: index,
        })),
        charges: 0,
        notes: "",
      }));
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

    const existingTrades = await prisma.trade.findMany({
      where: { userId: user.id },
      include: { transactions: { orderBy: { dateTime: "asc" as const } } },
      orderBy: { firstEntryAt: "desc" },
      take: 500,
    });

    const duplicateWarnings: { symbol: string; message: string }[] = [];

    for (const importedTrade of importTrades) {
      const matchingExisting = existingTrades.filter(
        (et) => et.symbol === importedTrade.symbol
      );

      for (const existing of matchingExisting) {
        const existingDates = existing.transactions.map((t) => new Date(t.dateTime).getTime());
        const existingPrices = existing.transactions.map((t) => t.price);
        const importedDates = importedTrade.transactions.map((t) => t.dateTime.getTime());
        const importedPrices = importedTrade.transactions.map((t) => t.price);

        const dateOverlap = importedDates.filter((id) =>
          existingDates.some((ed) => Math.abs(id - ed) < 24 * 60 * 60 * 1000)
        ).length;

        const priceOverlap = importedPrices.filter((ip) =>
          existingPrices.some((ep) => Math.abs(ip - ep) / ep < 0.02)
        ).length;

        const totalImported = importedTrade.transactions.length;
        const totalExisting = existing.transactions.length;
        const matchScore = (dateOverlap + priceOverlap) / Math.max(totalImported + totalExisting, 1);

        if (matchScore > 0.3) {
          const existingDate = existing.firstEntryAt
            ? new Date(existing.firstEntryAt).toLocaleDateString("en-IN")
            : "unknown date";
          duplicateWarnings.push({
            symbol: importedTrade.symbol,
            message: `Potential duplicate of existing ${importedTrade.symbol} trade from ${existingDate} (${dateOverlap} transaction(s) overlap)`,
          });
        }
      }
    }

    const createdTrades = [];
    let rowIndex = currentCount;

    for (const importedTrade of importTrades) {
      rowIndex++;

      const txPayload = importedTrade.transactions.map((t, i) => ({
        type: t.type,
        price: t.price,
        quantity: t.quantity,
        dateTime: t.dateTime,
        order: t.order ?? i,
      }));

      const { tradeType: derivedTradeType, firstEntryAt, status: derivedStatus } =
        deriveTradeTypeAndStatus(txPayload);

      const metrics = calculateTradeMetrics({
        tradeType: derivedTradeType,
        status: derivedStatus,
        charges: importedTrade.charges,
        transactions: txPayload.map((t) => ({
          type: t.type,
          price: t.price,
          quantity: t.quantity,
        })),
      });

      const trade = await prisma.trade.create({
        data: {
          userId: user.id,
          competitionId: competitionId || null,
          symbol: importedTrade.symbol,
          segment: importedTrade.segment,
          tradeType: derivedTradeType,
          status: derivedStatus,
          rowIndex,
          tags: "",
          notes: importedTrade.notes ?? "",
          setup: importedTrade.setup ?? null,
          planFollowed: importedTrade.planFollowed ?? null,
          exitTrigger: importedTrade.exitTrigger ?? null,
          proficiency: importedTrade.proficiency ?? null,
          growthAreas: importedTrade.growthAreas ?? null,
          charges: importedTrade.charges,
          closingPrice: importedTrade.closingPrice ?? null,
          stopLoss: importedTrade.stopLoss ?? null,
          capitalUsed: metrics.capitalUsed,
          netPnl: metrics.realizedPnl,
          firstEntryAt,
          lockedAt: derivedStatus === "CLOSED" ? new Date() : null,
          transactions: { create: txPayload },
        },
      });

      createdTrades.push(trade);
    }

    invalidateUserTrades(user.id);

    return NextResponse.json(
      {
        imported: createdTrades.length,
        open: createdTrades.filter((t) => t.status === "OPEN").length,
        closed: createdTrades.filter((t) => t.status === "CLOSED").length,
        brokerDetected: detectedFormat,
        parseErrors,
        duplicateWarnings,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, "Unable to import trades.");
  }
}
