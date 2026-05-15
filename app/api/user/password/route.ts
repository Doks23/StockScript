import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";

export async function PUT(req: NextRequest) {
  let user: any;
  try {
    user = await requireActiveUser();
  } catch (e: any) {
    console.error("Auth error:", e?.message || e);
    return NextResponse.json({ error: `Auth failed: ${e?.message || e}` }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch (e: any) {
    return NextResponse.json({ error: `JSON parse error: ${e?.message || e}` }, { status: 400 });
  }

  const { currentPassword, newPassword } = body;

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Current and new password are required" }, { status: 400 });
  }

  if (newPassword.length < 8) {
    return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
  }

  if (newPassword.length > 128) {
    return NextResponse.json({ error: "New password must be under 128 characters" }, { status: 400 });
  }

  try {
    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Password change error:", e);
    return NextResponse.json({ error: `Failed to change password: ${e?.message || e}` }, { status: 500 });
  }
}
