import { prisma } from "../../db/prisma.js";
import { userMappingSelect } from "../auth/auth.mapper.js";

/**
 * Profile data.
 *
 * Every write is scoped by `userId` and performed with `updateMany`/`deleteMany` carrying that
 * filter, so an id belonging to someone else simply matches nothing rather than being written
 * before we notice.
 */
export const usersRepository = {
  findProfile(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...userMappingSelect,
        createdAt: true,
        experiences: { orderBy: { sortOrder: "asc" } },
        educations: { orderBy: { sortOrder: "asc" } },
      },
    });
  },

  update(userId: string, data: {
    fullName?: string;
    phone?: string | null;
    wilayaId?: string | null;
    commune?: string | null;
    bio?: string | null;
    avatarUrl?: string | null;
  }) {
    return prisma.user.update({ where: { id: userId }, data });
  },

  // ── experience ──────────────────────────────────────────────────────────────

  addExperience(userId: string, data: {
    jobTitle: string;
    company: string;
    startDate: string;
    endDate: string | null;
    isPresent: boolean;
    description: string | null;
  }) {
    return prisma.experience.create({ data: { ...data, userId } });
  },

  updateExperience(userId: string, id: string, data: Record<string, unknown>) {
    return prisma.experience.updateMany({ where: { id, userId }, data });
  },

  deleteExperience(userId: string, id: string) {
    return prisma.experience.deleteMany({ where: { id, userId } });
  },

  // ── education ───────────────────────────────────────────────────────────────

  addEducation(userId: string, data: { degree: string; institution: string; year: string | null }) {
    return prisma.education.create({ data: { ...data, userId } });
  },

  updateEducation(userId: string, id: string, data: Record<string, unknown>) {
    return prisma.education.updateMany({ where: { id, userId }, data });
  },

  deleteEducation(userId: string, id: string) {
    return prisma.education.deleteMany({ where: { id, userId } });
  },
};
