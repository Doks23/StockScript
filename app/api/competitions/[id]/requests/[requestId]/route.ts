import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: { id: string; requestId: string } };

export async function POST(req: Request, { params }: RouteContext) {
  try {
    const user = await requireActiveUser();
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Admin only." }, { status: 403 });
    }

    const { action } = await req.json();
    if (!action || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    }

    const request = await prisma.competitionRequest.findUnique({
      where: { id: params.requestId },
      include: { user: true },
    });

    if (!request) {
      return NextResponse.json({ error: "Request not found." }, { status: 404 });
    }

    if (request.competitionId !== params.id) {
      return NextResponse.json({ error: "Mismatch." }, { status: 400 });
    }

    if (action === "approve") {
      // Add to participants
      await prisma.competitionParticipant.upsert({
        where: { competitionId_userId: { competitionId: params.id, userId: request.userId } },
        create: { competitionId: params.id, userId: request.userId },
        update: {},
      });

      // Update request status
      const updated = await prisma.competitionRequest.update({
        where: { id: params.requestId },
        data: {
          status: "APPROVED",
          approvedBy: user.id,
          approvedAt: new Date(),
        },
        include: { user: true },
      });

      return NextResponse.json(updated, { status: 200 });
    } else {
      // Reject
      const updated = await prisma.competitionRequest.update({
        where: { id: params.requestId },
        data: {
          status: "REJECTED",
          approvedBy: user.id,
          approvedAt: new Date(),
        },
        include: { user: true },
      });

      return NextResponse.json(updated, { status: 200 });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process request." },
      { status: 400 }
    );
  }
}
