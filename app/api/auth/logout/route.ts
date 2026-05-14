import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { destroySession } from "@/lib/auth";

export async function POST() {
  try {
    await destroySession();
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "Unable to logout.");
  }
}
