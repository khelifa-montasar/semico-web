import { prisma } from "../../db/prisma.js";

/**
 * Sales leads.
 *
 * Not farm-scoped: an enquiry arrives from an anonymous visitor on the marketing site, before any
 * account exists. Reads are owner-only because a lead list is a sales pipeline, not farm data.
 */
export const leadsRepository = {
  create(data: {
    name: string;
    email: string;
    phone: string | null;
    landArea: string | null;
    locale: string | null;
  }) {
    return prisma.lead.create({ data });
  },

  list(
    filters: { status?: string | undefined },
    window: { skip: number; take: number },
  ) {
    const where = filters.status ? { status: filters.status } : {};

    return prisma.$transaction([
      prisma.lead.findMany({
        where,
        // Newest first: a lead list is worked from the top.
        orderBy: { createdAt: "desc" },
        skip: window.skip,
        take: window.take,
      }),
      prisma.lead.count({ where }),
    ]);
  },

  findById(id: string) {
    return prisma.lead.findUnique({ where: { id } });
  },

  update(id: string, data: { status?: string; notes?: string | null }) {
    return prisma.lead.update({ where: { id }, data });
  },
};
