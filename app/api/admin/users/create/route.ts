import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

const DEFAULT_PASSWORD = "Trader@123";

export async function POST(request: Request) {
  try {
    await requireAdmin();

    const { name, email } = await request.json();

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json({ error: "A user with this email already exists." }, { status: 400 });
    }

    const passwordHash = await hashPassword(DEFAULT_PASSWORD);

    const user = await prisma.user.create({
      data: {
        name: String(name).trim(),
        email: normalizedEmail,
        emailVerifiedAt: new Date(),
        passwordHash,
        role: "TRADER",
        approvalStatus: "PENDING",
        isActive: false,
      },
    });

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        approvalStatus: user.approvalStatus,
        isActive: user.isActive,
      },
    }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Unable to create trader.");
  }
}
