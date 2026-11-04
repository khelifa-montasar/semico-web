import { prisma } from "../../db/prisma.js";

export const adminRepository = {
  /** One database snapshot, independent of the selected farm. */
  platformSnapshot() {
    return prisma.$transaction([
      prisma.farm.count(),
      prisma.user.count(),
      prisma.farm.findMany({
        take: 5,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          name: true,
          createdAt: true,
          owner: { select: { id: true, fullName: true, email: true } },
        },
      }),
    ]);
  },
};
