import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Prisma } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  APPROVED_STATS,
  APPROVED_TEAM,
} from "../prisma/seeds/landing-content-data.js";
import {
  landingContentSummary,
  seedLandingContent,
} from "../prisma/seeds/landing-content.js";
import { seedPublicContent } from "../prisma/seeds/content.js";
import { prisma } from "../src/db/prisma.js";
import { resetDatabase, testApp } from "./helpers/api.js";

beforeEach(async () => {
  await resetDatabase();
  await prisma.servicePlan.deleteMany();
  await prisma.product.deleteMany();
  await prisma.blogPost.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.testimonial.deleteMany();
  await prisma.stat.deleteMany();
});

async function unrelatedRows() {
  const rows: Record<string, unknown> = {};
  for (const name of Object.values(Prisma.ModelName)) {
    if (["TeamMember", "Testimonial", "Stat"].includes(name)) continue;
    rows[name] = await prisma.$queryRawUnsafe(
      `SELECT * FROM "${name}" ORDER BY rowid`,
    );
  }
  return rows;
}

describe("operator-approved landing content", () => {
  it("previews only the three authorized tables with stable slugs", () => {
    const summary = landingContentSummary();
    expect(
      Object.fromEntries(summary.map((item) => [item.table, item.count])),
    ).toEqual({ TeamMember: 2, Testimonial: 0, Stat: 4 });
    expect(summary[0]?.slugs).toEqual(["khelifa-montasar", "benrakaa-nasser"]);
    expect(summary[2]?.slugs).toEqual(APPROVED_STATS.map((stat) => stat.id));
    expect(APPROVED_TEAM.every((member) => member.linkedinUrl === null)).toBe(
      true,
    );
  });

  it("replaces retired content while preserving every other table", async () => {
    await seedPublicContent(prisma);
    await prisma.user.create({
      data: {
        email: "preserved@example.invalid",
        fullName: "Existing account",
        passwordHash: "non-authenticating-test-hash",
        role: "SUPER_ADMIN",
      },
    });
    await prisma.teamMember.createMany({
      data: APPROVED_TEAM.map((member, index) => ({
        ...member,
        id: `legacy-team-${index}`,
        roleEn: "Former placeholder role",
        bioEn: "Former placeholder biography",
        linkedinUrl: "https://example.invalid",
      })),
    });
    await prisma.stat.createMany({
      data: [
        {
          valueEn: "2,400+",
          valueAr: "2,400+",
          labelEn: "Active Systems",
          labelAr: "نظام نشط",
        },
        {
          valueEn: "12M",
          valueAr: "12M",
          labelEn: "Liters Saved",
          labelAr: "لتر موفر",
        },
        {
          valueEn: "38",
          valueAr: "38",
          labelEn: "Wilayas Covered",
          labelAr: "ولاية مشمولة",
        },
        {
          valueEn: "98%",
          valueAr: "98%",
          labelEn: "Uptime",
          labelAr: "وقت التشغيل",
        },
      ],
    });
    await prisma.testimonial.createMany({
      data: ["Karim B.", "Amira T."].map((authorName) => ({
        authorName,
        quoteEn: "Retired placeholder feedback",
        quoteAr: "نص سابق",
        farmEn: "Former placeholder location",
        farmAr: "موقع سابق",
      })),
    });

    const before = await unrelatedRows();
    const result = await seedLandingContent(prisma);
    expect(result.before).toEqual({ TeamMember: 2, Testimonial: 2, Stat: 4 });
    expect(result.removed).toEqual({ TeamMember: 2, Testimonial: 2, Stat: 4 });
    expect(result.after).toEqual({ TeamMember: 2, Testimonial: 0, Stat: 4 });
    expect(await unrelatedRows()).toEqual(before);
    expect(
      await prisma.teamMember.findMany({ orderBy: { sortOrder: "asc" } }),
    ).toEqual(APPROVED_TEAM);
    expect(
      await prisma.stat.findMany({ orderBy: { sortOrder: "asc" } }),
    ).toEqual(APPROVED_STATS);
  });

  it("upserts approved fields by stable slug without duplicates on rerun", async () => {
    await seedLandingContent(prisma);
    await prisma.teamMember.update({
      where: { id: "khelifa-montasar" },
      data: {
        bioEn: "Outdated biography",
        roleEn: "Outdated role",
        linkedinUrl: "https://example.invalid",
      },
    });
    await prisma.stat.update({
      where: { id: "water-savings-target" },
      data: { valueEn: "Outdated value" },
    });
    const result = await seedLandingContent(prisma);
    expect(result.after).toEqual({ TeamMember: 2, Testimonial: 0, Stat: 4 });
    expect(result.removed).toEqual({ TeamMember: 0, Testimonial: 0, Stat: 0 });
    expect(
      await prisma.teamMember.findMany({ orderBy: { sortOrder: "asc" } }),
    ).toEqual(APPROVED_TEAM);
    expect(
      await prisma.stat.findMany({ orderBy: { sortOrder: "asc" } }),
    ).toEqual(APPROVED_STATS);
  });

  it("serves exact bilingual bios and approved target labels without testimonials", async () => {
    await seedLandingContent(prisma);
    const team = await request(testApp())
      .get("/api/v1/content/team")
      .expect(200);
    for (const [index, member] of APPROVED_TEAM.entries()) {
      expect(team.body.data[index]).toMatchObject({
        id: member.id,
        name: member.name,
        role: { en: member.roleEn, ar: member.roleAr },
        bio: { en: member.bioEn, ar: member.bioAr },
        linkedinUrl: null,
      });
    }
    const stats = await request(testApp())
      .get("/api/v1/content/stats")
      .expect(200);
    for (const [index, stat] of APPROVED_STATS.entries()) {
      expect(stats.body.data[index]).toMatchObject({
        id: stat.id,
        value: { en: stat.valueEn, ar: stat.valueAr },
        label: { en: stat.labelEn, ar: stat.labelAr },
      });
    }
    const testimonials = await request(testApp())
      .get("/api/v1/content/testimonials")
      .expect(200);
    expect(testimonials.body.data).toEqual([]);
    await request(testApp()).get("/api/v1/admin/stats").expect(401);
    await request(testApp()).get("/api/v1/unknown-landing-route").expect(404);
  });

  it("previews without a database and forwards explicit apply safely", () => {
    const environment = { ...process.env };
    delete environment.DATABASE_URL;
    const preview = spawnSync(
      process.execPath,
      [
        createRequire(import.meta.url).resolve("tsx/cli"),
        fileURLToPath(
          new URL("../prisma/seed-landing-content.ts", import.meta.url),
        ),
        "--dry-run",
      ],
      { env: environment, encoding: "utf8" },
    );
    expect(preview.status).toBe(0);
    expect(JSON.parse(preview.stdout).mode).toBe("preview");
    const apply = spawnSync(
      "npm",
      ["run", "db:seed:landing", "--", "--apply"],
      {
        cwd: fileURLToPath(new URL("../../", import.meta.url)),
        env: environment,
        encoding: "utf8",
      },
    );
    expect(apply.status).toBe(1);
    expect(apply.stdout).not.toContain('"mode": "preview"');
    expect(apply.stderr).toContain("Approved landing content seed failed.");
  });
});
