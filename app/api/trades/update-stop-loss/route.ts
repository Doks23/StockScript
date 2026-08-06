import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { invalidateUserTrades } from "@/lib/cache";

export async function PATCH(request: Request) {
  try {
    const user = await requireActiveUser();
    const { tradeId, stopLoss } = await request.json();

    if (!tradeId || stopLoss === undefined) {
      return NextResponse.json({ error: "tradeId and stopLoss are required." }, { status: 400 });
    }

    // stopLoss is nullable here - the UI clears it by sending null.
    const value = stopLoss === null ? null : Number(stopLoss);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      return NextResponse.json(
        { error: "stopLoss must be a non-negative number or null." },
        { status: 400 },
      );
    }

    // Ownership belongs in the filter, not in a check afterwards. The previous
    // order wrote first and returned 403 second, so the update had already
    // landed on another user's trade by the time it was rejected.
    const result = await prisma.trade.updateMany({
      where: { id: tradeId, userId: user.id },
      data: { stopLoss: value },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Trade not found." }, { status: 404 });
    }

    invalidateUserTrades(user.id);

    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    return NextResponse.json({ trade }, { status: 200 });
  } catch (error) {
    return handleApiError(error, "Unable to update stop loss.");
  }
}
