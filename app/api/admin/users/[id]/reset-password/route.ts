import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

const DEFAULT_PASSWORD = "Trader@123";

type RouteContext = { params: { id: string } };

export async function POST(_: Request, { params }: RouteContext) {
  try {
    await requireAdmin();

    const user = await prisma.user.findUnique({ where: { id: params.id } });
    if (!user) {
      return NextResponse.json({ error: "Trader not found." }, { status: 404 });
    }

    const passwordHash = await hashPassword(DEFAULT_PASSWORD);

    await prisma.user.update({
      where: { id: params.id },
      data: { passwordHash },
    });

    return NextResponse.json({ message: `Password reset to ${DEFAULT_PASSWORD}` });
  } catch (error) {
    return handleApiError(error, "Unable to reset password.");
  }
}
