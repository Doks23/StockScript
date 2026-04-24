import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(_: Request, { params }: RouteContext) {
  try {
    const admin = await requireAdmin();
    const user = await prisma.user.findUnique({
      where: { id: params.id },
    });

    if (!user) {
      return NextResponse.json({ error: "Trader not found." }, { status: 404 });
    }

    if (!user.emailVerifiedAt) {
      return NextResponse.json({ error: "Trader must verify email first." }, { status: 400 });
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

    return NextResponse.json({ user: approved });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to approve trader." },
      { status: 400 },
    );
  }
}
