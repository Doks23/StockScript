import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request) {
  try {
    const user = await requireActiveUser();
    const { tradeId, stopLoss } = await request.json();

    if (!tradeId || stopLoss === undefined) {
      return NextResponse.json({ error: "tradeId and stopLoss are required." }, { status: 400 });
    }

    const trade = await prisma.trade.update({
      where: { id: tradeId },
      data: { stopLoss: Number(stopLoss) },
    });

    if (trade.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
    }

    return NextResponse.json({ trade }, { status: 200 });
  } catch (error) {
    return handleApiError(error, "Unable to update stop loss.");
  }
}
