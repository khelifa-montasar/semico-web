import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/db/prisma.js";
import {
  auth,
  createSuperAdmin,
  resetDatabase,
  testApp,
} from "./helpers/api.js";
import { buildCast } from "./helpers/roles.js";

const planInput = {
  nameEn: "Farm monitoring",
  nameAr: "مراقبة المزرعة",
  price: 2500.5,
  currency: "DZD",
  features: [{ en: "Live telemetry", ar: "القياسات المباشرة" }],
  isActive: true,
};
const postInput = {
  slug: "smart-irrigation",
  titleEn: "Smart irrigation",
  titleAr: "الري الذكي",
  excerptEn: "An irrigation guide.",
  excerptAr: "دليل الري.",
  bodyEn: "Monitor moisture before irrigating.",
  bodyAr: "راقب الرطوبة قبل الري.",
  category: "GUIDES",
  publishedAt: "2026-11-03T09:30:00.000Z",
  published: false,
};

beforeEach(async () => {
  await resetDatabase();
  await prisma.blogPost.deleteMany();
});
afterAll(async () => {
  await prisma.blogPost.deleteMany();
});

describe("pricing CMS", () => {
  it("creates, reads, edits, toggles, and deletes a bilingual plan without a farm", async () => {
    const admin = await createSuperAdmin();
    const headers = auth(admin.accessToken);
    const created = await request(testApp())
      .post("/api/v1/admin/pricing")
      .set(headers)
      .send(planInput)
      .expect(201);
    const plan = created.body.data;
    expect(plan).toMatchObject({
      name: { en: planInput.nameEn, ar: planInput.nameAr },
      features: planInput.features,
      price: 2500.5,
    });
    expect(plan).not.toHaveProperty("featuresJson");
    expect(
      JSON.parse(
        (await prisma.pricingPlan.findUniqueOrThrow({ where: { id: plan.id } }))
          .featuresJson,
      ),
    ).toEqual(planInput.features);
    const detail = await request(testApp())
      .get(`/api/v1/admin/pricing/${plan.id}`)
      .set(headers)
      .expect(200);
    expect(detail.headers["cache-control"]).toBe("private, no-store");
    const updated = await request(testApp())
      .patch(`/api/v1/admin/pricing/${plan.id}`)
      .set(headers)
      .send({
        nameAr: "الخطة الجديدة",
        price: 3100,
        features: [{ en: "Alerts", ar: "التنبيهات" }],
      })
      .expect(200);
    expect(updated.body.data).toMatchObject({
      name: { en: planInput.nameEn, ar: "الخطة الجديدة" },
      price: 3100,
    });
    await request(testApp())
      .patch(`/api/v1/admin/pricing/${plan.id}`)
      .set(headers)
      .send({ isActive: false })
      .expect(200);
    expect(
      (
        await request(testApp())
          .get("/api/v1/content/pricing-plans")
          .expect(200)
      ).body.data,
    ).toEqual([]);
    expect(
      (
        await request(testApp())
          .get("/api/v1/admin/pricing")
          .set(headers)
          .expect(200)
      ).body.data[0].isActive,
    ).toBe(false);
    await request(testApp())
      .patch(`/api/v1/admin/pricing/${plan.id}`)
      .set(headers)
      .send({ isActive: true })
      .expect(200);
    const published = await request(testApp())
      .get("/api/v1/content/pricing-plans")
      .expect(200);
    expect(published.headers["cache-control"]).toBe("no-store");
    expect(published.body.data[0]).toMatchObject({
      id: plan.id,
      price: 3100,
      features: [{ en: "Alerts", ar: "التنبيهات" }],
    });
    await request(testApp())
      .delete(`/api/v1/admin/pricing/${plan.id}`)
      .set(headers)
      .expect(204);
    await request(testApp())
      .get(`/api/v1/admin/pricing/${plan.id}`)
      .set(headers)
      .expect(404);
    await request(testApp())
      .patch(`/api/v1/admin/pricing/${plan.id}`)
      .set(headers)
      .send({ price: 1 })
      .expect(404);
    await request(testApp())
      .delete(`/api/v1/admin/pricing/${plan.id}`)
      .set(headers)
      .expect(404);
    expect(
      (
        await request(testApp())
          .get("/api/v1/content/pricing-plans")
          .expect(200)
      ).body.data,
    ).toEqual([]);
  });

  it("applies safe defaults, normalizes currency, and supports free plans", async () => {
    const admin = await createSuperAdmin();
    const result = await request(testApp())
      .post("/api/v1/admin/pricing")
      .set(auth(admin.accessToken))
      .send({
        nameEn: " Free ",
        nameAr: " مجاني ",
        price: 0,
        currency: " usd ",
      })
      .expect(201);
    expect(result.body.data).toMatchObject({
      name: { en: "Free", ar: "مجاني" },
      price: 0,
      currency: "USD",
      features: [],
      isActive: true,
    });
  });

  it("paginates all plans while public pricing includes only active plans in price order", async () => {
    const admin = await createSuperAdmin();
    await prisma.pricingPlan.createMany({
      data: [5, 1, 4, 2, 3].map((price) => ({
        nameEn: `Plan ${price}`,
        nameAr: `الخطة ${price}`,
        price,
        isActive: price !== 2,
      })),
    });
    const result = await request(testApp())
      .get("/api/v1/admin/pricing?page=2&pageSize=2")
      .set(auth(admin.accessToken))
      .expect(200);
    expect(result.body.meta).toEqual({
      page: 2,
      pageSize: 2,
      total: 5,
      totalPages: 3,
    });
    expect(
      result.body.data.map((plan: { price: number }) => plan.price),
    ).toEqual([3, 4]);
    expect(
      (
        await request(testApp())
          .get("/api/v1/content/pricing-plans")
          .expect(200)
      ).body.data.map((plan: { price: number }) => plan.price),
    ).toEqual([1, 3, 4, 5]);
    await request(testApp())
      .get("/api/v1/admin/pricing?page=0")
      .set(auth(admin.accessToken))
      .expect(400);
  });

  it.each([
    { nameAr: " " },
    { nameEn: "" },
    { price: -1 },
    { price: "2500" },
    { currency: "DA" },
    { features: [{ en: "Monitoring" }] },
    { features: "[]" },
    { isActive: "false" },
    { featuresJson: "[]" },
    { id: "chosen-id" },
  ])("rejects invalid or unexpected pricing fields: %j", async (invalid) => {
    const admin = await createSuperAdmin();
    await request(testApp())
      .post("/api/v1/admin/pricing")
      .set(auth(admin.accessToken))
      .send({ ...planInput, ...invalid })
      .expect(400);
    expect(await prisma.pricingPlan.count()).toBe(0);
  });

  it("rejects empty and invalid patches without modifying the plan", async () => {
    const admin = await createSuperAdmin();
    const plan = await prisma.pricingPlan.create({
      data: { nameEn: "Plan", nameAr: "الخطة", price: 100 },
    });
    for (const input of [
      {},
      { price: -1 },
      { isActive: null },
      { featuresJson: "broken" },
    ]) {
      await request(testApp())
        .patch(`/api/v1/admin/pricing/${plan.id}`)
        .set(auth(admin.accessToken))
        .send(input)
        .expect(400);
    }
    expect(
      await prisma.pricingPlan.findUniqueOrThrow({ where: { id: plan.id } }),
    ).toMatchObject({ price: 100, isActive: true, featuresJson: "[]" });
  });
});

describe("blog CMS", () => {
  it("manages bilingual drafts, publishing, updates, and deletion through the existing blog model", async () => {
    const admin = await createSuperAdmin();
    const headers = auth(admin.accessToken);
    const created = await request(testApp())
      .post("/api/v1/admin/blog")
      .set(headers)
      .send(postInput)
      .expect(201);
    const post = created.body.data;
    expect(post).toMatchObject({
      title: { en: postInput.titleEn, ar: postInput.titleAr },
      body: { en: postInput.bodyEn, ar: postInput.bodyAr },
      published: false,
    });
    await request(testApp())
      .get(`/api/v1/admin/blog/${post.id}`)
      .set(headers)
      .expect(200);
    expect(
      (
        await request(testApp())
          .get("/api/v1/admin/blog")
          .set(headers)
          .expect(200)
      ).body.data[0].published,
    ).toBe(false);
    expect(
      (await request(testApp()).get("/api/v1/content/blog").expect(200)).body
        .data,
    ).toEqual([]);
    await request(testApp())
      .get("/api/v1/content/blog/smart-irrigation")
      .expect(404);
    const updated = await request(testApp())
      .patch(`/api/v1/admin/blog/${post.id}`)
      .set(headers)
      .send({
        titleAr: "إرشادات الري",
        bodyAr: "محتوى جديد بالعربية.",
        published: true,
      })
      .expect(200);
    expect(updated.body.data).toMatchObject({
      title: { en: postInput.titleEn, ar: "إرشادات الري" },
      body: { en: postInput.bodyEn, ar: "محتوى جديد بالعربية." },
      publishedAt: postInput.publishedAt,
    });
    const article = await request(testApp())
      .get("/api/v1/content/blog/smart-irrigation")
      .expect(200);
    expect(article.body.data.body).toEqual(updated.body.data.body);
    expect(
      (await request(testApp()).get("/api/v1/content/blog").expect(200)).body
        .data[0],
    ).not.toHaveProperty("body");
    await request(testApp())
      .patch(`/api/v1/admin/blog/${post.id}`)
      .set(headers)
      .send({ published: false })
      .expect(200);
    await request(testApp())
      .get("/api/v1/content/blog/smart-irrigation")
      .expect(404);
    await request(testApp())
      .delete(`/api/v1/admin/blog/${post.id}`)
      .set(headers)
      .expect(204);
    await request(testApp())
      .get(`/api/v1/admin/blog/${post.id}`)
      .set(headers)
      .expect(404);
    await request(testApp())
      .patch(`/api/v1/admin/blog/${post.id}`)
      .set(headers)
      .send({ titleEn: "Missing" })
      .expect(404);
    await request(testApp())
      .delete(`/api/v1/admin/blog/${post.id}`)
      .set(headers)
      .expect(404);
  });

  it("defaults new posts to drafts and reports duplicate slugs as conflicts", async () => {
    const admin = await createSuperAdmin();
    const { published: _published, ...input } = postInput;
    const result = await request(testApp())
      .post("/api/v1/admin/blog")
      .set(auth(admin.accessToken))
      .send(input)
      .expect(201);
    expect(result.body.data.published).toBe(false);
    await request(testApp())
      .post("/api/v1/admin/blog")
      .set(auth(admin.accessToken))
      .send(input)
      .expect(409);
    const second = await request(testApp())
      .post("/api/v1/admin/blog")
      .set(auth(admin.accessToken))
      .send({ ...input, slug: "another-post" })
      .expect(201);
    await request(testApp())
      .patch(`/api/v1/admin/blog/${second.body.data.id}`)
      .set(auth(admin.accessToken))
      .send({ slug: input.slug })
      .expect(409);
    expect(await prisma.blogPost.count()).toBe(2);
  });

  it("paginates drafts and published posts with full editable content", async () => {
    const admin = await createSuperAdmin();
    await prisma.blogPost.createMany({
      data: [1, 2, 3].map((day) => ({
        ...postInput,
        slug: `post-${day}`,
        published: day === 1,
        publishedAt: new Date(`2026-11-0${day}T09:00:00Z`),
      })),
    });
    const response = await request(testApp())
      .get("/api/v1/admin/blog?page=2&pageSize=2")
      .set(auth(admin.accessToken))
      .expect(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body.meta).toEqual({
      page: 2,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });
    expect(response.body.data[0]).toMatchObject({
      slug: "post-1",
      body: { en: postInput.bodyEn, ar: postInput.bodyAr },
    });
    await request(testApp())
      .get("/api/v1/admin/blog?pageSize=101")
      .set(auth(admin.accessToken))
      .expect(400);
  });

  it.each([
    { titleEn: " " },
    { titleAr: "" },
    { bodyEn: "" },
    { bodyAr: " " },
    { slug: "../private" },
    { category: "OTHER" },
    { publishedAt: "not-a-date" },
    { published: "true" },
    { coverImageUrl: "javascript:alert(1)" },
    { authorId: "another-user" },
  ])("rejects invalid or unexpected blog fields: %j", async (invalid) => {
    const admin = await createSuperAdmin();
    await request(testApp())
      .post("/api/v1/admin/blog")
      .set(auth(admin.accessToken))
      .send({ ...postInput, ...invalid })
      .expect(400);
    expect(await prisma.blogPost.count()).toBe(0);
  });

  it("rejects empty patches", async () => {
    const admin = await createSuperAdmin();
    const post = await prisma.blogPost.create({
      data: { ...postInput, publishedAt: new Date(postInput.publishedAt) },
    });
    await request(testApp())
      .patch(`/api/v1/admin/blog/${post.id}`)
      .set(auth(admin.accessToken))
      .send({})
      .expect(400);
  });
});

describe("CMS security", () => {
  it("blocks anonymous callers and every farm role on every CMS verb", async () => {
    const cast = await buildCast();
    const callers = [
      null,
      cast.owner,
      cast.operatorValve,
      cast.operatorPlain,
      cast.engineer,
      cast.invited,
      cast.disabled,
    ];
    for (const resource of ["pricing", "blog"]) {
      for (const method of ["get", "post", "patch", "delete"] as const) {
        for (const caller of callers) {
          const path = `/api/v1/admin/${resource}${method === "patch" || method === "delete" ? "/unknown" : ""}`;
          const call = request(testApp())[method](path);
          if (caller) call.set(auth(caller.accessToken));
          if (method === "post" || method === "patch") call.send({});
          expect((await call).status).toBe(caller ? 403 : 401);
        }
      }
    }
    expect(await prisma.pricingPlan.count()).toBe(0);
    expect(await prisma.blogPost.count()).toBe(0);
  });

  it("revokes CMS access immediately when a super admin is disabled", async () => {
    const admin = await createSuperAdmin();
    await prisma.user.update({
      where: { id: admin.userId },
      data: { status: "DISABLED" },
    });
    await request(testApp())
      .get("/api/v1/admin/pricing")
      .set(auth(admin.accessToken))
      .expect(403);
    await request(testApp())
      .post("/api/v1/admin/blog")
      .set(auth(admin.accessToken))
      .send(postInput)
      .expect(403);
  });
});
