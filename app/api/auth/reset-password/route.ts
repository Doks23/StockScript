import { NextResponse } from "next/server";
import { verifyPasswordResetToken, usePasswordResetToken } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { z } from "zod";

const schema = z.object({
  token: z.string(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  try {
    const payload = schema.parse(await request.json());

    const resetToken = await verifyPasswordResetToken(payload.token);

    if (!resetToken) {
      return NextResponse.json(
        { error: "Invalid or expired password reset token." },
        { status: 400 }
      );
    }

    const newPasswordHash = hashPassword(payload.password);
    await usePasswordResetToken(resetToken.id, resetToken.userId, newPasswordHash);

    return NextResponse.json(
      { message: "Password has been reset successfully." },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to reset password." },
      { status: 400 }
    );
  }
}
