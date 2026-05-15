import { NextRequest, NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  const { name, bio } = body;

  const data: Record<string, string> = {};

  if (typeof name === "string" && name.trim().length > 0) {
    data.name = name.trim();
  }

  if (typeof bio === "string") {
    data.bio = bio.trim();
  }

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
    });
    return NextResponse.json({ name: updated.name, bio: updated.bio });
  } catch (e: any) {
    console.error("DB error:", e);
    return NextResponse.json({ error: `DB error: ${e?.message || e}` }, { status: 500 });
  }
}
