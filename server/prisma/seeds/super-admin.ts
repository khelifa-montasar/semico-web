import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hashPassword } from "../../src/lib/password.js";

const superAdminSeedSchema = z.object({
  email: z.string().trim().toLowerCase().email().default("admin@semico.dz"),
  password: z.string().min(8).max(200),
  fullName: z.string().trim().min(2).max(120).default("Platform Admin"),
});

/** Creates an independent platform account without altering existing users or farms. */
export async function seedSuperAdmin(prisma: PrismaClient, credentials: unknown) {
  const input = superAdminSeedSchema.parse(credentials);
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    include: { _count: { select: { ownedFarms: true } } },
  });

  if (existing) {
    if (existing.role !== "SUPER_ADMIN") {
      throw new Error("The super admin email already belongs to another role; choose a different email.");
    }
    if (existing.farmId || existing._count.ownedFarms > 0 || existing.workerType || existing.valveControl) {
      throw new Error("The existing super admin has farm associations or worker capabilities.");
    }
    // Re-running must not reset a password or re-enable a disabled account.
    return { id: existing.id, email: existing.email, created: false };
  }

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      fullName: input.fullName,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      farmId: null,
      workerType: null,
      valveControl: false,
    },
    select: { id: true, email: true },
  });
  return { ...user, created: true };
}
