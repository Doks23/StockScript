import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function handleApiError(error: unknown, fallback = "An unexpected error occurred.") {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request data." }, { status: 400 });
  }

  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: 400 });
}
