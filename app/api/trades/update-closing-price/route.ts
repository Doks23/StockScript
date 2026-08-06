import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { invalidateUserTrades } from "@/lib/cache";

export async function PATCH(request: Request) {
  try {
    const user = await requireActiveUser();
    const { tradeId, closingPrice } = await request.json();

    if (!tradeId || closingPrice === undefined) {
      return NextResponse.json({ error: "tradeId and closingPrice are required." }, { status: 400 });
    }

    const price = Number(closingPrice);
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json(
        { error: "closingPrice must be a non-negative number." },
        { status: 400 },
      );
    }

    // Ownership is part of the filter rather than a check after the fact. The
    // previous order wrote first and returned 403 second, so the update had
    // already landed on another user's trade by the time it was rejected.
    const result = await prisma.trade.updateMany({
      where: { id: tradeId, userId: user.id },
      data: { closingPrice: price },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Trade not found." }, { status: 404 });
    }

    invalidateUserTrades(user.id);

    const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
    return NextResponse.json({ trade }, { status: 200 });
  } catch (error) {
    return handleApiError(error, "Unable to update closing price.");
  }
}
