import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/queries";

export async function GET() {
  const user = await requireActiveUser();
  const groupedTrades = (await getDashboardData(user.id)).groupedTrades;

  return NextResponse.json({ groupedTrades });
}
