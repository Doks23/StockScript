/**
 * Journal symbol -> quote symbol mappings for the signed-in user.
 * ─────────────────────────────────────────────────────────────────────
 * GET  lists them, so the journal can point each symbol at the right chart.
 * POST records one, which is how a symbol gets mapped without waiting for it to
 *      turn up in an EOD price refresh - closed trades never appear there.
 *
 * These are the same rows the price sync reads, so a mapping saved here also
 * fixes tomorrow's EOD price for that symbol. That is the point of reusing the
 * table, but it does mean a typo repoints a price as well as a chart. The user
 * sees the chart open on whatever they typed straight away, which is the
 * fastest possible signal that the ticker was wrong.
 * ─────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActiveUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { toQuoteSymbol } from "@/lib/tradingview";

export async function GET() {
  try {
    const user = await requireActiveUser();

    const maps = await prisma.symbolQuoteMap.findMany({
      where: { userId: user.id },
      select: { symbol: true, quoteSymbol: true, displayName: true },
    });

    return NextResponse.json({ maps });
  } catch (error) {
    return handleApiError(error, "Could not load symbol mappings.");
  }
}

const payloadSchema = z.object({
  symbol: z.string().trim().min(1).max(40),
  /** As typed - "AVALON", "NSE:AVALON" and "AVALON.NS" are all accepted. */
  ticker: z.string().trim().min(1).max(40),
});

export async function POST(request: Request) {
  try {
    const user = await requireActiveUser();
    const { symbol, ticker } = payloadSchema.parse(await request.json());

    const quoteSymbol = toQuoteSymbol(ticker);
    if (!quoteSymbol) {
      return NextResponse.json(
        { error: "That does not look like a ticker." },
        { status: 400 },
      );
    }

    // Uppercased to match how the price sync looks these rows up.
    const journalSymbol = symbol.toUpperCase();

    await prisma.symbolQuoteMap.upsert({
      where: { userId_symbol: { userId: user.id, symbol: journalSymbol } },
      create: { userId: user.id, symbol: journalSymbol, quoteSymbol },
      update: { quoteSymbol, confirmedAt: new Date() },
    });

    return NextResponse.json({ symbol: journalSymbol, quoteSymbol });
  } catch (error) {
    return handleApiError(error, "Could not save the mapping.");
  }
}
