import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/trade-utils";

export async function POST(request: Request) {
  try {
    const payload = loginSchema.parse(await request.json());
    const user = await prisma.user.findUnique({
      where: {
        email: payload.email.toLowerCase(),
      },
    });

    if (!user || !verifyPassword(payload.password, user.passwordHash)) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    await createSession(user.id);

    const redirectTo = !user.emailVerifiedAt
      ? "/verify-email"
      : !user.isActive
        ? "/pending-approval"
        : user.role === "ADMIN"
          ? "/admin"
          : "/trades";

    return NextResponse.json({ redirectTo });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to log in." },
      { status: 400 },
    );
  }
}
