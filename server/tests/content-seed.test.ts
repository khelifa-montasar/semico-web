import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { Prisma } from "@prisma/client";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  publicContentSummary,
  seedPublicContent,
} from "../prisma/seeds/content.js";
import { prisma } from "../src/db/prisma.js";
import { resetDatabase, testApp } from "./helpers/api.js";

const expectedCounts = {
  Wilaya: 58,
  ServicePlan: 3,
  PricingPlan: 2,
  Product: 6,
  BlogPost: 4,
};

beforeEach(async () => {
  await resetDatabase();
  await prisma.servicePlan.deleteMany();
  await prisma.product.deleteMany();
  await prisma.blogPost.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.stat.deleteMany();
  await prisma.testimonial.deleteMany();
});

async function tableCounts() {
  const counts: Record<string, number> = {};
  for (const name of Object.values(Prisma.ModelName)) {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) AS count FROM "${name}"`,
    );
    counts[name] = Number(rows[0]?.count ?? 0);
  }
  return counts;
}

describe("public-only production content seed", () => {
  it("previews without a database connection or Prisma environment loading", () => {
    const environment = { ...process.env };
    delete environment.DATABASE_URL;
    const preview = spawnSync(
      process.execPath,
      [
        createRequire(import.meta.url).resolve("tsx/cli"),
        fileURLToPath(new URL("../prisma/seed-content.ts", import.meta.url)),
        "--dry-run",
      ],
      { env: environment, encoding: "utf8" },
    );
    expect(preview.status).toBe(0);
    expect(JSON.parse(preview.stdout).mode).toBe("preview");
  });

  it("refuses apply without explicit DATABASE_URL before Prisma can load a local .env", () => {
    const environment = { ...process.env };
    delete environment.DATABASE_URL;
    const result = spawnSync(
      process.execPath,
      [
        createRequire(import.meta.url).resolve("tsx/cli"),
        fileURLToPath(new URL("../prisma/seed-content.ts", import.meta.url)),
        "--apply",
      ],
      { env: environment, encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Public content seed failed.");
  });

  it("previews only the five allowed public/reference tables", () => {
    const summary = publicContentSummary();
    expect(
      Object.fromEntries(summary.map((item) => [item.table, item.count])),
    ).toEqual(expectedCounts);
    expect(summary.every((item) => item.names.length === item.count)).toBe(
      true,
    );
    expect(summary.flatMap((item) => item.names)).not.toContain(
      "Khelifa Montasar",
    );
    expect(summary.flatMap((item) => item.names)).not.toContain("Karim B.");
  });

  it("populates public APIs without adding identities, farms, or telemetry", async () => {
    const counts = await seedPublicContent(prisma);
    expect(counts.after).toEqual(expectedCounts);
    const allCounts = await tableCounts();
    for (const name of Object.values(Prisma.ModelName)) {
      if (!(name in expectedCounts)) expect(allCounts[name]).toBe(0);
    }
    for (const [path, count] of [
      ["/content/pricing-plans", 2],
      ["/content/service-plans", 3],
      ["/content/products", 6],
      ["/content/blog", 4],
      ["/reference/wilayas", 58],
    ] as const) {
      const response = await request(testApp())
        .get(`/api/v1${path}`)
        .expect(200);
      expect(response.body.data).toHaveLength(count);
    }
    const post = await request(testApp())
      .get("/api/v1/content/blog/lora-revolutionizing-algerian-agriculture")
      .expect(200);
    expect(post.body.data.body).toBeNull();
    expect(post.body.data.coverImageUrl).toBeNull();
    await request(testApp()).get("/api/v1/admin/pricing").expect(401);
    await request(testApp())
      .get("/api/v1/not-a-real-content-route")
      .expect(404);
  });

  it("is idempotent and preserves existing private records", async () => {
    const account = await prisma.user.create({
      data: {
        email: "existing@example.invalid",
        fullName: "Existing account",
        passwordHash: "non-authenticating-test-hash",
        role: "SUPER_ADMIN",
      },
    });
    const booking = await prisma.booking.create({
      data: {
        name: "Existing booking",
        email: "existing@example.invalid",
        day: new Date("2026-12-01T00:00:00.000Z"),
        startTime: "9:00 am",
        userId: account.id,
      },
    });
    const before = await tableCounts();
    await seedPublicContent(prisma);
    const firstCounts = await tableCounts();
    const firstProducts = await prisma.product.findMany({
      orderBy: { id: "asc" },
    });
    const repeated = await seedPublicContent(prisma);
    expect(repeated.before).toEqual(expectedCounts);
    expect(repeated.after).toEqual(expectedCounts);
    expect(await tableCounts()).toEqual(firstCounts);
    expect(await prisma.product.findMany({ orderBy: { id: "asc" } })).toEqual(
      firstProducts,
    );
    expect(await prisma.user.findUnique({ where: { id: account.id } })).toEqual(
      account,
    );
    expect(
      await prisma.booking.findUnique({ where: { id: booking.id } }),
    ).toEqual(booking);
    for (const [name, count] of Object.entries(before)) {
      if (!(name in expectedCounts)) expect(firstCounts[name]).toBe(count);
    }
  });

  it("adopts matching existing rows and never overwrites editorial changes", async () => {
    const pricing = await prisma.pricingPlan.create({
      data: {
        id: "editor-pricing",
        nameEn: "Residential",
        nameAr: "سكني",
        price: 321,
        featuresJson: "[]",
        isActive: false,
      },
    });
    const service = await prisma.servicePlan.create({
      data: {
        id: "editor-service",
        titleEn: "Farm",
        titleAr: "مزرعة",
        descEn: "Approved service description",
        descAr: "وصف معتمد",
      },
    });
    const product = await prisma.product.create({
      data: {
        id: "editor-product",
        iconKey: "Droplets",
        titleEn: "Soil Moisture Sensor",
        titleAr: "مستشعر",
        descEn: "Approved product description",
        descAr: "وصف معتمد",
      },
    });
    const post = await prisma.blogPost.create({
      data: {
        slug: "lora-revolutionizing-algerian-agriculture",
        publishedAt: new Date("2026-01-01T00:00:00.000Z"),
        category: "GUIDES",
        titleEn: "Approved article",
        titleAr: "مقال معتمد",
        excerptEn: "Approved excerpt",
        excerptAr: "ملخص معتمد",
        bodyEn: "Approved body",
        published: false,
      },
    });
    const wilaya = await prisma.wilaya.create({
      data: { code: "16", nameEn: "Alger", nameAr: "الجزائر", covered: false },
    });

    await seedPublicContent(prisma);
    expect(
      await prisma.pricingPlan.findUnique({ where: { id: pricing.id } }),
    ).toEqual(pricing);
    expect(
      await prisma.servicePlan.findUnique({ where: { id: service.id } }),
    ).toEqual(service);
    expect(
      await prisma.product.findUnique({ where: { id: product.id } }),
    ).toEqual(product);
    expect(
      await prisma.blogPost.findUnique({ where: { id: post.id } }),
    ).toEqual(post);
    expect(
      await prisma.wilaya.findUnique({ where: { code: wilaya.code } }),
    ).toEqual(wilaya);

    const revised = await prisma.product.update({
      where: { id: "content-product-semico-controller-v2" },
      data: { titleEn: "Approved revised controller" },
    });
    expect((await seedPublicContent(prisma)).after).toEqual(expectedCounts);
    expect(
      await prisma.product.findUnique({ where: { id: revised.id } }),
    ).toEqual(revised);
  });
});
