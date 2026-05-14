import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(_: Request, { params }: RouteContext) {
  try {
    const user = await requireActiveUser();

    const participation = await prisma.competitionParticipant.upsert({
      where: {
        competitionId_userId: {
          competitionId: params.id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        competitionId: params.id,
        userId: user.id,
      },
    });

    return NextResponse.json({ participation }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Unable to join competition.");
  }
}
