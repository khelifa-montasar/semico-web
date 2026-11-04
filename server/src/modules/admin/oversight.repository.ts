import type { Prisma } from "@prisma/client";
import type { PaginationQuery } from "@semico/shared";
import { prisma } from "../../db/prisma.js";

export const adminFarmSelect = {
  id: true,
  name: true,
  status: true,
  createdAt: true,
  owner: { select: { id: true, fullName: true, email: true } },
  _count: { select: { workers: true } },
} satisfies Prisma.FarmSelect;

export const adminUserSelect = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  workerType: true,
  status: true,
  platformDisabled: true,
  createdAt: true,
  farm: { select: { id: true, name: true } },
  ownedFarms: {
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.UserSelect;

export type AdminFarmRow = Prisma.FarmGetPayload<{
  select: typeof adminFarmSelect;
}>;
export type AdminUserRow = Prisma.UserGetPayload<{
  select: typeof adminUserSelect;
}>;

export const oversightRepository = {
  farms({ page, pageSize }: PaginationQuery) {
    return prisma.$transaction([
      prisma.farm.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: adminFarmSelect,
      }),
      prisma.farm.count(),
    ]);
  },
  users({ page, pageSize }: PaginationQuery) {
    return prisma.$transaction([
      prisma.user.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: adminUserSelect,
      }),
      prisma.user.count(),
    ]);
  },
};
