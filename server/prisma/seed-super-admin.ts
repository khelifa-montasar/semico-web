import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { seedSuperAdmin } from "./seeds/super-admin.js";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  if (!process.env.SUPER_ADMIN_PASSWORD) {
    throw new Error("Set SUPER_ADMIN_PASSWORD (8–200 characters) before running db:seed:admin.");
  }
  const admin = await seedSuperAdmin(prisma, {
    email: process.env.SUPER_ADMIN_EMAIL,
    password: process.env.SUPER_ADMIN_PASSWORD,
    fullName: process.env.SUPER_ADMIN_NAME,
  });
  console.log(`Super admin ${admin.created ? "created" : "already exists"}: ${admin.email} (no farm)`);
}

main()
  .catch((error) => {
    console.error("Super admin seed failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
