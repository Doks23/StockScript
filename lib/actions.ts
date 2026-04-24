"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";

import { competitionPayloadSchema } from "./trade-utils"; // Keep this import

export async function updateRequestStatus(formData: FormData) {
  const id = formData.get("requestId") as string;
  const status = formData.get("status") as "APPROVED" | "REJECTED";

  const request = await prisma.competitionRequest.findUnique({ where: { id } });
  if (!request) return;

  await prisma.competitionRequest.update({
    where: { id },
    data: { status },
  });

  if (status === "APPROVED") {
    await prisma.competitionRequest.update({
      where: { id },
      data: { approvedAt: new Date(), approvedBy: request.userId },
    });

    const existing = await prisma.competitionParticipant.findFirst({
      where: {
        userId: request.userId,
        competitionId: request.competitionId,
      },
    });

    if (!existing) {
      await prisma.competitionParticipant.create({
        data: {
          userId: request.userId,
          competitionId: request.competitionId,
        },
      });
    }
  }

  revalidatePath("/competitions");
  revalidatePath("/leaderboard");
}

export async function requestToJoinCompetition(formData: FormData) {
  const competitionId = formData.get("competitionId") as string;
  const user = await requireActiveUser();

  // Check if a request already exists or if the user is already a participant
  const existingRequest = await prisma.competitionRequest.findFirst({
    where: { userId: user.id, competitionId },
  });
  const existingParticipant = await prisma.competitionParticipant.findFirst({
    where: { userId: user.id, competitionId },
  });

  if (existingRequest || existingParticipant) {
    // User has already requested or joined, do nothing or show a message
    return;
  }

  await prisma.competitionRequest.create({
    data: { userId: user.id, competitionId },
  });
  revalidatePath("/competitions");
  revalidatePath("/leaderboard");
}

export async function createCompetition(formData: FormData) {
  const user = await requireActiveUser();
  if (user.role !== "ADMIN") {
    throw new Error("Unauthorized");
  }

  const parsed = competitionPayloadSchema.safeParse({
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    visibility: "PUBLIC", // Force PUBLIC since visibility concept is removed from UI
  });

  if (!parsed.success) {
    throw new Error("Invalid competition data: " + parsed.error.message);
  }

  await prisma.competition.create({
    data: {
      name: parsed.data.name,
      startDate: new Date(parsed.data.startDate),
      endDate: new Date(parsed.data.endDate),
      visibility: parsed.data.visibility,
      createdBy: user.id,
    },
  });
  revalidatePath("/competitions");
  revalidatePath("/leaderboard");
  redirect("/competitions");
}

export async function deleteJoinRequest(formData: FormData) {
  const id = formData.get("requestId") as string;

  const user = await requireActiveUser();
  if (user.role !== "ADMIN" && user.role !== "SUPER_TRADER") {
    throw new Error("Unauthorized");
  }

  await prisma.competitionRequest.delete({ where: { id } });

  revalidatePath("/competitions");
  revalidatePath("/leaderboard");
}

export async function deleteCompetition(formData: FormData) {
  const competitionId = formData.get("competitionId") as string;

  const user = await requireActiveUser();
  if (user.role !== "ADMIN") {
    throw new Error("Unauthorized");
  }

  // Prisma's cascade delete should handle related records (requests, participants) if configured in schema.
  // Trades associated with the competition might need to be updated (competitionId: null) or deleted,
  // depending on your application's logic and Prisma schema setup.
  await prisma.competition.delete({
    where: { id: competitionId },
  });

  revalidatePath("/competitions");
  revalidatePath("/leaderboard"); // Leaderboard might change if a competition is deleted
}
