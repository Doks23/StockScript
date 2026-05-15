import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadAvatar } from "@/lib/storage";

export async function POST(req: NextRequest) {
  let user: any;
  try {
    user = await requireActiveUser();
  } catch (e: any) {
    console.error("Auth error:", e?.message || e);
    return NextResponse.json({ error: `Auth failed: ${e?.message || e}` }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (e: any) {
    return NextResponse.json({ error: `Form data error: ${e?.message || e}` }, { status: 400 });
  }

  const file = formData.get("avatar") as File | null;

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Image must be under 5MB" }, { status: 400 });
  }

  let url: string;
  try {
    url = await uploadAvatar(file);
  } catch (e: any) {
    console.error("uploadAvatar error:", e);
    return NextResponse.json({ error: `Upload fn error: ${e?.message || e}` }, { status: 500 });
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: url },
    });
  } catch (e: any) {
    console.error("DB update error:", e);
    return NextResponse.json({ error: `DB error: ${e?.message || e}` }, { status: 500 });
  }

  return NextResponse.json({ avatarUrl: url });
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireActiveUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: null },
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Avatar delete error:", err);
    return NextResponse.json({ error: "Failed to remove avatar" }, { status: 500 });
  }
}
