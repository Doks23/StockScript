import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest) {
  try {
    const user = await requireActiveUser();
    const body = await req.json();
    
    if (!body.capital || typeof body.capital !== "number") {
      return NextResponse.json({ error: "Invalid capital amount" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { portfolioCapital: body.capital },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to update capital" }, { status: 500 });
  }
}
