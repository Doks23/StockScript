import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { getLeaderboard } from "@/lib/queries";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(_: Request, { params }: RouteContext) {
  await requireActiveUser();
  const leaderboard = await getLeaderboard(params.id);

  if (!leaderboard) {
    return NextResponse.json({ error: "Competition not found." }, { status: 404 });
  }

  return NextResponse.json(leaderboard);
}
