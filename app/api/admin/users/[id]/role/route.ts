import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: { id: string } };

const ALLOWED_ROLES = ["TRADER", "SUPER_TRADER"] as const;

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    await requireAdmin();

    const { role } = await request.json();

    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: params.id } });
    if (!user) {
      return NextResponse.json({ error: "Trader not found." }, { status: 404 });
    }

    if (user.role === "ADMIN") {
      return NextResponse.json({ error: "Cannot change an admin's role." }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: params.id },
      data: { role },
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update role." },
      { status: 400 },
    );
  }
}
