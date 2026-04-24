import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request) {
  try {
    const user = await requireActiveUser();
    const { tradeId, closingPrice } = await request.json();

    if (!tradeId || closingPrice === undefined) {
      return NextResponse.json({ error: "tradeId and closingPrice are required." }, { status: 400 });
    }

    const trade = await prisma.trade.update({
      where: { id: tradeId },
      data: { closingPrice: Number(closingPrice) },
    });

    // Verify user owns the trade
    if (trade.userId !== user.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
    }

    return NextResponse.json({ trade }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update closing price." },
      { status: 400 }
    );
  }
}
