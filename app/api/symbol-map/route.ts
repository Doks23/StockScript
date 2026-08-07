/**
 * GET /api/symbol-map
 *
 * The current user's confirmed journal-symbol -> quote-symbol mappings, written
 * by the EOD price sync. The journal reads them to point a TradingView chart at
 * the right instrument, since a journal symbol is often a company name.
 *
 * One row per traded symbol at most, so the whole map is cheaper to send than to
 * query per chart open.
 */

import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

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
