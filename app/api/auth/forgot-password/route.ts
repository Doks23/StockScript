import { NextResponse } from "next/server";
import { createPasswordResetToken, getPasswordResetUrl } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
});

export async function POST(request: Request) {
  try {
    const payload = schema.parse(await request.json());

    const user = await prisma.user.findUnique({
      where: { email: payload.email.toLowerCase() },
    });

    if (!user) {
      return NextResponse.json(
        { message: "If an account exists with this email, a password reset link will be sent." },
        { status: 200 }
      );
    }

    const token = await createPasswordResetToken(user.id);
    const resetUrl = getPasswordResetUrl(token);

    return NextResponse.json(
      {
        message: "If an account exists with this email, a password reset link will be sent.",
        resetUrl,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to process password reset request." },
      { status: 400 }
    );
  }
}
