import type {
  EducationEntry,
  EducationInput,
  ExperienceEntry,
  ExperienceInput,
  UpdateProfileInput,
  UserProfile,
} from "@semico/shared";
import type { Request } from "express";
import { prisma } from "../../db/prisma.js";
import { ApiError } from "../../lib/ApiError.js";
import { writeAudit } from "../../lib/audit.js";
import { toAuthUser } from "../auth/auth.mapper.js";
import { usersRepository } from "./users.repository.js";

/**
 * The user's own profile, experience and education.
 *
 * Every user edits only their own record — there is no `:userId` in any route, so editing someone
 * else's profile is not expressible rather than merely forbidden. Owners manage other people
 * through the workers module, which is a different concern with different rules.
 */

type ProfileRow = NonNullable<Awaited<ReturnType<typeof usersRepository.findProfile>>>;
type ExperienceRow = ProfileRow["experiences"][number];
type EducationRow = ProfileRow["educations"][number];

function toExperience(row: ExperienceRow): ExperienceEntry {
  return {
    id: row.id,
    jobTitle: row.jobTitle,
    company: row.company,
    startDate: row.startDate,
    endDate: row.endDate ?? undefined,
    isPresent: row.isPresent,
    description: row.description ?? undefined,
  };
}

function toEducation(row: EducationRow): EducationEntry {
  return {
    id: row.id,
    degree: row.degree,
    institution: row.institution,
    year: row.year ?? undefined,
  };
}

function toProfile(row: ProfileRow): UserProfile {
  return {
    ...toAuthUser(row),
    createdAt: row.createdAt.toISOString(),
    experiences: row.experiences.map(toExperience),
    educations: row.educations.map(toEducation),
  };
}

async function loadProfile(userId: string): Promise<UserProfile> {
  const row = await usersRepository.findProfile(userId);
  if (!row) throw ApiError.notFound("Your profile could not be found");
  return toProfile(row);
}

/** Empty strings from a cleared form field mean "remove this value", not "store an empty string". */
function blankToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value.trim() === "" ? null : value.trim();
}

export const usersService = {
  me(auth: { userId: string }): Promise<UserProfile> {
    return loadProfile(auth.userId);
  },

  async updateProfile(
    auth: { userId: string; farmId: string | null },
    input: UpdateProfileInput,
    req?: Request,
  ): Promise<UserProfile> {
    const data: Record<string, unknown> = {};

    if (input.fullName !== undefined) data.fullName = input.fullName;
    if (input.wilayaId !== undefined) data.wilayaId = blankToNull(input.wilayaId);
    if (input.commune !== undefined) data.commune = blankToNull(input.commune);
    if (input.bio !== undefined) data.bio = blankToNull(input.bio);
    if (input.avatarUrl !== undefined) data.avatarUrl = blankToNull(input.avatarUrl);
    if (input.phone !== undefined) data.phone = blankToNull(input.phone);

    // email and role are deliberately absent: email is the login identity, and role changes are an
    // administrative action, not something a profile form should be able to do.
    await usersRepository.update(auth.userId, data);

    await prisma.$transaction(async (tx) => {
      await writeAudit(
        tx,
        {
          actorId: auth.userId,
          farmId: auth.farmId,
          action: "PROFILE_UPDATED",
          entityType: "USER",
          entityId: auth.userId,
          // Field names only — never the values, which may include a phone number or bio.
          metadata: { fields: Object.keys(data) },
        },
        req,
      );
    });

    return loadProfile(auth.userId);
  },

  // ── experience ──────────────────────────────────────────────────────────────

  async addExperience(auth: { userId: string }, input: ExperienceInput): Promise<UserProfile> {
    await usersRepository.addExperience(auth.userId, {
      jobTitle: input.jobTitle,
      company: input.company,
      startDate: input.startDate,
      endDate: input.endDate && input.endDate.length > 0 ? input.endDate : null,
      isPresent: input.isPresent,
      description: input.description && input.description.length > 0 ? input.description : null,
    });
    return loadProfile(auth.userId);
  },

  async updateExperience(
    auth: { userId: string },
    id: string,
    input: Partial<ExperienceInput>,
  ): Promise<UserProfile> {
    const result = await usersRepository.updateExperience(auth.userId, id, input);
    if (result.count === 0) throw ApiError.notFound("That experience entry does not exist");
    return loadProfile(auth.userId);
  },

  async deleteExperience(auth: { userId: string }, id: string): Promise<UserProfile> {
    const result = await usersRepository.deleteExperience(auth.userId, id);
    if (result.count === 0) throw ApiError.notFound("That experience entry does not exist");
    return loadProfile(auth.userId);
  },

  // ── education ───────────────────────────────────────────────────────────────

  async addEducation(auth: { userId: string }, input: EducationInput): Promise<UserProfile> {
    await usersRepository.addEducation(auth.userId, {
      degree: input.degree,
      institution: input.institution,
      year: input.year && input.year.length > 0 ? input.year : null,
    });
    return loadProfile(auth.userId);
  },

  async updateEducation(
    auth: { userId: string },
    id: string,
    input: Partial<EducationInput>,
  ): Promise<UserProfile> {
    const result = await usersRepository.updateEducation(auth.userId, id, input);
    if (result.count === 0) throw ApiError.notFound("That education entry does not exist");
    return loadProfile(auth.userId);
  },

  async deleteEducation(auth: { userId: string }, id: string): Promise<UserProfile> {
    const result = await usersRepository.deleteEducation(auth.userId, id);
    if (result.count === 0) throw ApiError.notFound("That education entry does not exist");
    return loadProfile(auth.userId);
  },
};
