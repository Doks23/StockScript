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

    let resetUrl: string | null = null;

    if (user) {
      const token = await createPasswordResetToken(user.id);
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      resetUrl = `${baseUrl}/reset-password?token=${token}`;
    }

    return NextResponse.json({ resetUrl }, { status: 200 });
  } catch (error) {
    return handleApiError(error, "Unable to process password reset request.");
  }
}
