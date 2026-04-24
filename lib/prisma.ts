import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

import { PrismaClient } from "@prisma/client";

const isProduction = process.env.NODE_ENV === "production";

function createPrismaClient() {
  return new PrismaClient({
    log: isProduction ? ["error"] : ["error", "warn"],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma || (globalForPrisma.prisma = createPrismaClient());

if (!isProduction) {
  globalForPrisma.prisma = prisma;
}
