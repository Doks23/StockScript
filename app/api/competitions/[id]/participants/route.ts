import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: { id: string } };

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const user = await requireActiveUser();

    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "email required." }, { status: 400 });

    const trader = await prisma.user.findUnique({
      where: { email: String(email).trim().toLowerCase() },
      select: { id: true, name: true, role: true, approvalStatus: true },
    });

    if (!trader) return NextResponse.json({ error: "No user found with that email." }, { status: 404 });
    if (trader.approvalStatus !== "APPROVED") {
      return NextResponse.json({ error: "Trader account is not yet approved." }, { status: 400 });
    }
    if (trader.role === "ADMIN") {
      return NextResponse.json({ error: "Admins cannot be added to competitions." }, { status: 403 });
    }

    if (user.role === "ADMIN") {
      const participant = await prisma.competitionParticipant.upsert({
        where: { competitionId_userId: { competitionId: params.id, userId: trader.id } },
        create: { competitionId: params.id, userId: trader.id },
        update: {},
      });

      await prisma.competitionRequest.upsert({
        where: { competitionId_userId: { competitionId: params.id, userId: trader.id } },
        create: {
          competitionId: params.id,
          userId: trader.id,
          status: "APPROVED",
          approvedBy: user.id,
          approvedAt: new Date(),
        },
        update: {
          status: "APPROVED",
          approvedBy: user.id,
          approvedAt: new Date(),
        },
      });

      return NextResponse.json({ participant, traderName: trader.name }, { status: 201 });
    } else {
      const request = await prisma.competitionRequest.upsert({
        where: { competitionId_userId: { competitionId: params.id, userId: user.id } },
        create: {
          competitionId: params.id,
          userId: user.id,
          status: "PENDING",
        },
        update: {
          status: "PENDING",
        },
      });

      return NextResponse.json({ request }, { status: 201 });
    }
  } catch (error) {
    return handleApiError(error, "Failed to process request.");
  }
}
