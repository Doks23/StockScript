import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const user = await requireActiveUser();
    const { ids } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "No trade IDs provided." }, { status: 400 });
    }

    const { count } = await prisma.trade.deleteMany({
      where: { id: { in: ids }, userId: user.id },
    });

    return NextResponse.json({ deleted: count });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete trades." },
      { status: 400 }
    );
  }
}
