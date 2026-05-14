import { NextResponse } from "next/server";
import { verifyPasswordResetToken, applyPasswordReset } from "@/lib/auth";
import { handleApiError } from "@/lib/api-error";
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

    const newPasswordHash = await hashPassword(payload.password);
    await applyPasswordReset(resetToken.id, resetToken.userId, newPasswordHash);

    return NextResponse.json(
      { message: "Password has been reset successfully." },
      { status: 200 }
    );
  } catch (error) {
    return handleApiError(error, "Unable to reset password.");
  }
}
