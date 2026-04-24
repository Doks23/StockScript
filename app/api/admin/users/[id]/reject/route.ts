import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: { id: string } };

export async function POST(_: Request, { params }: RouteContext) {
  try {
    await requireAdmin();

    const user = await prisma.user.findUnique({ where: { id: params.id } });
    if (!user) {
      return NextResponse.json({ error: "Trader not found." }, { status: 404 });
    }

    const updated = await prisma.user.update({
      where: { id: params.id },
      data: { approvalStatus: "REJECTED", isActive: false },
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to reject trader." },
      { status: 400 },
    );
  }
}
