import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: { id: string } };

export async function DELETE(_: Request, { params }: RouteContext) {
  try {
    const admin = await requireAdmin();

    if (admin.id === params.id) {
      return NextResponse.json({ error: "Cannot delete your own account." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: params.id } });
    if (!user) {
      return NextResponse.json({ error: "Trader not found." }, { status: 404 });
    }

    await prisma.user.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete trader." },
      { status: 400 },
    );
  }
}
