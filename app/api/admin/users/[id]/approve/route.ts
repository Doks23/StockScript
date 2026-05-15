import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: { id: string } };

export async function POST(_: Request, { params }: RouteContext) {
  try {
    const admin = await requireAdmin();
    const user = await prisma.user.findUnique({ where: { id: params.id } });

    if (!user) {
      return NextResponse.json({ error: "Trader not found." }, { status: 404 });
    }

    const approved = await prisma.user.update({
      where: { id: params.id },
      data: {
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
        approvedBy: admin.id,
        isActive: true,
      },
    });

    return NextResponse.json({
      user: {
        id: approved.id,
        name: approved.name,
        email: approved.email,
        role: approved.role,
        approvalStatus: approved.approvalStatus,
        isActive: approved.isActive,
      },
    });
  } catch (error) {
    return handleApiError(error, "Unable to approve trader.");
  }
}
