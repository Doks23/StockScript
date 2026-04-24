import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";

const SESSION_COOKIE = "stockscript_session";
const SESSION_TTL_DAYS = 30;
const EMAIL_TOKEN_TTL_HOURS = 24;

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = addDays(new Date(), SESSION_TTL_DAYS);

  await prisma.session.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const token = cookies().get(SESSION_COOKIE)?.value;

  if (token) {
    await prisma.session.deleteMany({
      where: {
        token,
      },
    });
  }

  cookies().delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  const session = await prisma.session.findFirst({
    where: {
      token,
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      user: true,
    },
  });

  if (!session) {
    return null;
  }

  return session.user;
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireActiveUser() {
  const user = await requireUser();

  if (!user.emailVerifiedAt) {
    redirect("/verify-email");
  }

  if (!user.isActive || user.approvalStatus !== "APPROVED") {
    redirect("/pending-approval");
  }

  return user;
}

export async function requireAdmin() {
  const user = await requireActiveUser();

  if (user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return user;
}

export async function createEmailVerificationToken(userId: string, email: string) {
  await prisma.emailVerificationToken.deleteMany({
    where: {
      userId,
      verifiedAt: null,
    },
  });

  const token = randomBytes(32).toString("hex");

  await prisma.emailVerificationToken.create({
    data: {
      token,
      userId,
      email,
      expiresAt: addHours(new Date(), EMAIL_TOKEN_TTL_HOURS),
    },
  });

  return token;
}

export async function verifyEmailToken(token: string) {
  const verification = await prisma.emailVerificationToken.findFirst({
    where: {
      token,
      verifiedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      user: true,
    },
  });

  if (!verification) {
    return null;
  }

  await prisma.$transaction([
    prisma.emailVerificationToken.update({
      where: {
        id: verification.id,
      },
      data: {
        verifiedAt: new Date(),
      },
    }),
    prisma.user.update({
      where: {
        id: verification.userId,
      },
      data: {
        emailVerifiedAt: new Date(),
      },
    }),
  ]);

  return verification.user;
}

export function getVerificationUrl(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${baseUrl}/verify-email?token=${token}`;
}
