import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { invalidateUserTrades } from "@/lib/cache";

const MAX_NOTES = 2000;

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const user = await requireActiveUser();
    const body = await request.json().catch(() => null);
    if (typeof body?.notes !== "string") {
      return NextResponse.json({ error: "notes must be a string." }, { status: 400 });
    }
    const notes = body.notes.trim();
    if (notes.length > MAX_NOTES) {
      return NextResponse.json(
        { error: `Notes are limited to ${MAX_NOTES} characters.` },
        { status: 400 },
      );
    }

    const result = await prisma.trade.updateMany({
      where: { id: params.id, userId: user.id },
      data: { notes },
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Trade not found." }, { status: 404 });
    }

    invalidateUserTrades(user.id);
    return NextResponse.json({ notes });
  } catch (err) {
    return handleApiError(err);
  }
}
