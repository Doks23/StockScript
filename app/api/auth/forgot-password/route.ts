import { NextResponse } from "next/server";
import { createPasswordResetToken } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
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

    if (user) {
      await createPasswordResetToken(user.id);
    }

    // Always return the same response to prevent email enumeration
    return NextResponse.json(
      { message: "If an account exists with this email, a password reset link will be sent." },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error, "Unable to process password reset request.");
  }
}
