import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
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
      data: {
        emailVerifiedAt: user.emailVerifiedAt ? null : new Date(),
      },
    });

    return NextResponse.json({
      user: {
        id: updated.id,
        emailVerifiedAt: updated.emailVerifiedAt,
      },
    });
  } catch (error) {
    return handleApiError(error, "Unable to update email verification status.");
  }
}
