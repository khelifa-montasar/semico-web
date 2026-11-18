import type { Prisma, PrismaClient } from "@prisma/client";
import { APPROVED_STATS, APPROVED_TEAM } from "./landing-content-data.js";

async function landingCounts(client: Prisma.TransactionClient) {
  return {
    TeamMember: await client.teamMember.count(),
    Testimonial: await client.testimonial.count(),
    Stat: await client.stat.count(),
  };
}

export function landingContentSummary() {
  return [
    {
      table: "TeamMember",
      count: APPROVED_TEAM.length,
      slugs: APPROVED_TEAM.map((member) => member.id),
      names: APPROVED_TEAM.map((member) => member.name),
      source:
        "Operator-approved Phase D profiles; verbatim English/Arabic bios",
    },
    {
      table: "Testimonial",
      count: 0,
      slugs: [],
      names: [],
      source: "Omitted by operator; remove former placeholder endorsements",
    },
    {
      table: "Stat",
      count: APPROVED_STATS.length,
      slugs: APPROVED_STATS.map((stat) => stat.id),
      names: APPROVED_STATS.map((stat) => `${stat.valueEn} ${stat.labelEn}`),
      source: "Operator-approved design targets and USTHB-TECHINNOV incubation",
    },
  ];
}

export async function seedLandingContent(client: PrismaClient) {
  return client.$transaction(
    async (transaction) => {
      const before = await landingCounts(transaction);
      const removed = {
        TeamMember: (
          await transaction.teamMember.deleteMany({
            where: { id: { notIn: APPROVED_TEAM.map((member) => member.id) } },
          })
        ).count,
        Testimonial: (await transaction.testimonial.deleteMany()).count,
        Stat: (
          await transaction.stat.deleteMany({
            where: { id: { notIn: APPROVED_STATS.map((stat) => stat.id) } },
          })
        ).count,
      };

      for (const member of APPROVED_TEAM) {
        await transaction.teamMember.upsert({
          where: { id: member.id },
          create: member,
          update: member,
        });
      }
      for (const stat of APPROVED_STATS) {
        await transaction.stat.upsert({
          where: { id: stat.id },
          create: stat,
          update: stat,
        });
      }
      return { before, removed, after: await landingCounts(transaction) };
    },
    { timeout: 30_000 },
  );
}
