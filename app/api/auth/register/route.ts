import { NextResponse } from "next/server";
import { createEmailVerificationToken, getVerificationUrl } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/trade-utils";

export async function POST(request: Request) {
  try {
    const payload = registerSchema.parse(await request.json());

    const existingUser = await prisma.user.findUnique({
      where: { email: payload.email.toLowerCase() },
    });

    if (existingUser) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 400 });
    }

    const user = await prisma.user.create({
      data: {
        name: payload.name,
        email: payload.email.toLowerCase(),
        emailVerifiedAt: new Date(),
        passwordHash: await hashPassword(payload.password),
        role: "TRADER",
        approvalStatus: "APPROVED",
        isActive: true,
      },
    });

    const token = await createEmailVerificationToken(user.id, user.email);
    const verificationUrl = getVerificationUrl(token);

    return NextResponse.json({ userId: user.id, verificationUrl }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Unable to register account.");
  }
}
