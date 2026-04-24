import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.user.updateMany({
    data: {
      emailVerifiedAt: new Date(),
      approvalStatus: "APPROVED",
      isActive: true,
    }
  });
  console.log("All existing users approved!");
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
