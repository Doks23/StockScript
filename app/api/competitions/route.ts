import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { getCompetitions } from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { competitionPayloadSchema } from "@/lib/trade-utils";

export async function GET() {
  await requireActiveUser();
  const competitions = await getCompetitions();
  return NextResponse.json({ competitions });
}

export async function POST(request: Request) {
  try {
    const user = await requireActiveUser();
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const json = await request.json();
    const payload = competitionPayloadSchema.parse(json);

    const competition = await prisma.competition.create({
      data: {
        name: payload.name,
        startDate: new Date(payload.startDate),
        endDate: new Date(payload.endDate),
        visibility: payload.visibility,
        createdBy: user.id,
        participants: {
          create: {
            userId: user.id,
          },
        },
      },
    });

    return NextResponse.json({ competition }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create competition.",
      },
      { status: 400 },
    );
  }
}
