import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { prisma } from "../src/db/prisma.js";
import { resetDatabase, testApp } from "./helpers/api.js";

/**
 * Public marketing content.
 *
 * Every endpoint here is unauthenticated, which makes this the one module where the interesting
 * properties are not about permissions. They are about what it must NOT return: an unpublished draft
 * is not merely absent from the list, it must be unreachable by guessing its slug; and a
 * half-translated row must fall back to the language that has content rather than rendering an empty
 * string on the marketing page.
 *
 * NOTE ON ISOLATION: `resetDatabase()` does not clear the content tables, because the seed populates
 * them and other suites read them as fixtures. This file therefore clears its own rows first — an
 * unhandled hazard rather than a design, recorded here so the next suite that writes content knows.
 */

async function clearContent() {
  await prisma.blogPost.deleteMany();
  await prisma.product.deleteMany();
  await prisma.servicePlan.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.stat.deleteMany();
  await prisma.testimonial.deleteMany();
}

beforeEach(async () => {
  await resetDatabase();
  await clearContent();
});

function seedBlogPost(overrides: Partial<Parameters<typeof prisma.blogPost.create>[0]["data"]> = {}) {
  return prisma.blogPost.create({
    data: {
      slug: "drip-irrigation-basics",
      publishedAt: new Date("2026-03-01T00:00:00.000Z"),
      category: "TECHNOLOGY",
      titleEn: "Drip irrigation basics",
      titleAr: "أساسيات الري بالتنقيط",
      excerptEn: "What every Algerian grower should know.",
      excerptAr: "ما يجب أن يعرفه كل مزارع جزائري.",
      bodyEn: "A long body in English.",
      bodyAr: "نص طويل بالعربية.",
      published: true,
      sortOrder: 0,
      ...overrides,
    },
  });
}

describe("the endpoints need no session", () => {
  const PUBLIC_ROUTES = [
    "/api/v1/content/bundle",
    "/api/v1/content/blog",
    "/api/v1/content/products",
    "/api/v1/content/service-plans",
    "/api/v1/content/team",
    "/api/v1/content/stats",
    "/api/v1/content/testimonials",
  ];

  for (const route of PUBLIC_ROUTES) {
    it(`serves ${route} to an anonymous caller`, async () => {
      // The marketing pages render before anyone signs in, so a guard creeping onto this router
      // would take the public site down rather than fail a permission check.
      await request(testApp()).get(route).expect(200);
    });
  }

  it("serves a blog post by slug to an anonymous caller", async () => {
    await seedBlogPost();
    await request(testApp()).get("/api/v1/content/blog/drip-irrigation-basics").expect(200);
  });

  it("returns an empty collection rather than an error when there is no content", async () => {
    // An empty marketing site is a content problem, not a 500.
    const response = await request(testApp()).get("/api/v1/content/products").expect(200);
    expect(response.body.data).toEqual([]);
  });
});

describe("blog list", () => {
  it("returns published posts", async () => {
    await seedBlogPost();

    const response = await request(testApp()).get("/api/v1/content/blog").expect(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].slug).toBe("drip-irrigation-basics");
  });

  it("hides an unpublished draft from the list", async () => {
    await seedBlogPost({ slug: "published-one" });
    await seedBlogPost({ slug: "draft-one", published: false });

    const response = await request(testApp()).get("/api/v1/content/blog").expect(200);
    expect(response.body.data.map((post: { slug: string }) => post.slug)).toEqual(["published-one"]);
  });

  it("makes a draft unreachable by slug, not merely absent from the list", async () => {
    // The important half. Hiding a draft from the index while still serving it at its slug leaves the
    // article one guess away — and slugs are derived from titles, so guessing is not hard.
    await seedBlogPost({ slug: "unreleased", published: false });

    const response = await request(testApp()).get("/api/v1/content/blog/unreleased").expect(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("orders newest first", async () => {
    await seedBlogPost({ slug: "older", publishedAt: new Date("2026-01-01T00:00:00.000Z") });
    await seedBlogPost({ slug: "newer", publishedAt: new Date("2026-06-01T00:00:00.000Z") });
    await seedBlogPost({ slug: "middle", publishedAt: new Date("2026-03-01T00:00:00.000Z") });

    const response = await request(testApp()).get("/api/v1/content/blog").expect(200);
    expect(response.body.data.map((post: { slug: string }) => post.slug)).toEqual(["newer", "middle", "older"]);
  });

  it("filters by category", async () => {
    await seedBlogPost({ slug: "tech", category: "TECHNOLOGY" });
    await seedBlogPost({ slug: "guide", category: "GUIDES" });

    const response = await request(testApp()).get("/api/v1/content/blog?category=GUIDES").expect(200);
    expect(response.body.data.map((post: { slug: string }) => post.slug)).toEqual(["guide"]);
  });

  it("accepts a lowercase, padded category", async () => {
    // The client sends whatever is in the query string; normalising here keeps the filter from
    // silently returning nothing for "guides".
    await seedBlogPost({ slug: "guide", category: "GUIDES" });

    const response = await request(testApp()).get("/api/v1/content/blog?category=%20guides%20").expect(200);
    expect(response.body.data.map((post: { slug: string }) => post.slug)).toEqual(["guide"]);
  });

  it("rejects an unknown category instead of quietly returning nothing", async () => {
    // An unrecognised filter is a client bug. Returning an empty list would make it look like there
    // is simply no content in that category.
    const response = await request(testApp())
      .get("/api/v1/content/blog?category=NONSENSE")
      .expect(400);

    expect(response.body.error.code).toBe("VALIDATION_FAILED");
    expect(response.body.error.details).toHaveProperty("category");
  });

  it("never leaks the body in the list", async () => {
    // The index needs a summary. Shipping every article's full text to render a list of titles is
    // the kind of weight that is invisible until the blog has fifty posts.
    await seedBlogPost();

    const response = await request(testApp()).get("/api/v1/content/blog").expect(200);
    expect(response.body.data[0]).not.toHaveProperty("body");
    expect(JSON.stringify(response.body)).not.toContain("A long body in English.");
  });
});

describe("a single blog post", () => {
  it("includes the body, which the summary omits", async () => {
    await seedBlogPost();

    const response = await request(testApp()).get("/api/v1/content/blog/drip-irrigation-basics").expect(200);
    expect(response.body.data.body).toEqual({
      en: "A long body in English.",
      ar: "نص طويل بالعربية.",
    });
  });

  it("404s an unknown slug", async () => {
    await request(testApp()).get("/api/v1/content/blog/never-written").expect(404);
  });

  it("returns a null body when neither language has one", async () => {
    // `locOrNull` rather than `loc`: a null body lets the client omit the section instead of
    // rendering an empty paragraph.
    await seedBlogPost({ bodyEn: null, bodyAr: null });

    const response = await request(testApp()).get("/api/v1/content/blog/drip-irrigation-basics").expect(200);
    expect(response.body.data.body).toBeNull();
  });
});

describe("the bilingual contract", () => {
  it("returns every translatable field as both languages", async () => {
    await seedBlogPost();

    const response = await request(testApp()).get("/api/v1/content/blog").expect(200);
    const post = response.body.data[0];

    for (const field of ["title", "excerpt"]) {
      expect(post[field], `${field} is not a Localized pair`).toEqual({
        en: expect.any(String),
        ar: expect.any(String),
      });
      expect(post[field].en.length).toBeGreaterThan(0);
      expect(post[field].ar.length).toBeGreaterThan(0);
    }
  });

  it("falls back to the language that has content rather than returning an empty string", async () => {
    // A half-translated row is the normal state of a growing content set, and `body` is the only pair
    // the schema permits to be half-filled — title, excerpt, role, quote and the rest are NOT NULL
    // columns, so for those the `loc()` fallback is defensive rather than reachable. The body is
    // where it is observable: without it the client would render a blank article instead of the
    // Arabic text it has.
    await seedBlogPost({ bodyEn: null, bodyAr: "نص بالعربية فقط" });

    const response = await request(testApp()).get("/api/v1/content/blog/drip-irrigation-basics").expect(200);
    expect(response.body.data.body).toEqual({ en: "نص بالعربية فقط", ar: "نص بالعربية فقط" });
  });

  it("carries both languages of every collection in one response", async () => {
    // The client's language toggle re-renders from cache; it cannot refetch, so a single-language
    // payload would leave the toggle showing the wrong language until a reload.
    await prisma.product.create({
      data: { iconKey: "droplet", titleEn: "Drip kit", titleAr: "طقم التنقيط", descEn: "Desc", descAr: "وصف", sortOrder: 0 },
    });
    await prisma.teamMember.create({
      data: { initials: "AM", name: "Amina M.", roleEn: "Agronomist", roleAr: "مهندسة زراعية", bioEn: "Bio", bioAr: "نبذة", sortOrder: 0 },
    });
    await prisma.stat.create({
      data: { valueEn: "40%", valueAr: "٤٠٪", labelEn: "Water saved", labelAr: "مياه موفرة", sortOrder: 0 },
    });
    await prisma.testimonial.create({
      data: { quoteEn: "It works.", quoteAr: "إنه يعمل.", authorName: "Yacine", farmEn: "Farm A", farmAr: "مزرعة أ", sortOrder: 0 },
    });
    await prisma.servicePlan.create({
      data: { titleEn: "Starter", titleAr: "المبتدئ", priceValue: 15000, descEn: "Desc", descAr: "وصف", sortOrder: 0 },
    });

    for (const [route, field] of [
      ["/api/v1/content/products", "title"],
      ["/api/v1/content/service-plans", "title"],
      ["/api/v1/content/team", "role"],
      ["/api/v1/content/stats", "value"],
      ["/api/v1/content/testimonials", "quote"],
    ] as const) {
      const response = await request(testApp()).get(route).expect(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0][field], `${route} ${field}`).toMatchObject({
        en: expect.any(String),
        ar: expect.any(String),
      });
    }
  });
});

describe("ordered collections", () => {
  it("returns products in the editor's order, not insertion order", async () => {
    // sortOrder exists so an editor can reorder the grid without a deploy — so the API has to
    // honour it rather than relying on the client to sort.
    await prisma.product.create({
      data: { iconKey: "c", titleEn: "Third", titleAr: "ثالث", descEn: "d", descAr: "د", sortOrder: 3 },
    });
    await prisma.product.create({
      data: { iconKey: "a", titleEn: "First", titleAr: "أول", descEn: "d", descAr: "د", sortOrder: 1 },
    });
    await prisma.product.create({
      data: { iconKey: "b", titleEn: "Second", titleAr: "ثان", descEn: "d", descAr: "د", sortOrder: 2 },
    });

    const response = await request(testApp()).get("/api/v1/content/products").expect(200);
    expect(response.body.data.map((product: { title: { en: string } }) => product.title.en)).toEqual([
      "First",
      "Second",
      "Third",
    ]);
  });

  it("orders team, stats and testimonials the same way", async () => {
    await prisma.teamMember.create({
      data: { initials: "B", name: "Second", roleEn: "r", roleAr: "ر", bioEn: "b", bioAr: "ب", sortOrder: 2 },
    });
    await prisma.teamMember.create({
      data: { initials: "A", name: "First", roleEn: "r", roleAr: "ر", bioEn: "b", bioAr: "ب", sortOrder: 1 },
    });
    await prisma.stat.create({ data: { valueEn: "2", valueAr: "٢", labelEn: "Second", labelAr: "ث", sortOrder: 2 } });
    await prisma.stat.create({ data: { valueEn: "1", valueAr: "١", labelEn: "First", labelAr: "أ", sortOrder: 1 } });
    await prisma.testimonial.create({
      data: { quoteEn: "second", quoteAr: "٢", authorName: "B", farmEn: "f", farmAr: "ف", sortOrder: 2 },
    });
    await prisma.testimonial.create({
      data: { quoteEn: "first", quoteAr: "١", authorName: "A", farmEn: "f", farmAr: "ف", sortOrder: 1 },
    });

    const team = await request(testApp()).get("/api/v1/content/team").expect(200);
    expect(team.body.data.map((member: { name: string }) => member.name)).toEqual(["First", "Second"]);

    const stats = await request(testApp()).get("/api/v1/content/stats").expect(200);
    expect(stats.body.data.map((stat: { label: { en: string } }) => stat.label.en)).toEqual(["First", "Second"]);

    const testimonials = await request(testApp()).get("/api/v1/content/testimonials").expect(200);
    expect(testimonials.body.data.map((item: { authorName: string }) => item.authorName)).toEqual(["A", "B"]);
  });
});

describe("quote-only service plans", () => {
  it("returns null for a price the plan does not have, and null for absent unit and badge", async () => {
    // "Custom" is represented by a null price, and the UI branches on it to show a consultation CTA
    // instead of a number. A 0 here would render as a free plan.
    await prisma.servicePlan.create({
      data: { titleEn: "Custom", titleAr: "مخصص", priceValue: null, descEn: "Talk to us", descAr: "تواصل معنا", sortOrder: 0 },
    });

    const response = await request(testApp()).get("/api/v1/content/service-plans").expect(200);
    const plan = response.body.data[0];

    expect(plan.priceValue).toBeNull();
    expect(plan.unit).toBeNull();
    expect(plan.badge).toBeNull();
    // The description always exists, so it is a pair rather than null.
    expect(plan.description).toEqual({ en: "Talk to us", ar: "تواصل معنا" });
  });
});

describe("the bundle", () => {
  it("returns all six collections", async () => {
    const response = await request(testApp()).get("/api/v1/content/bundle").expect(200);

    expect(Object.keys(response.body.data).sort()).toEqual([
      "blogPosts",
      "products",
      "servicePlans",
      "stats",
      "team",
      "testimonials",
    ]);
  });

  it("agrees with the individual endpoints it replaces", async () => {
    // The bundle is an optimisation, so it must not be a second implementation that can drift. This
    // asserts the two agree on real data rather than merely on shape.
    await seedBlogPost();
    await prisma.product.create({
      data: { iconKey: "droplet", titleEn: "Drip kit", titleAr: "طقم", descEn: "d", descAr: "د", sortOrder: 0 },
    });
    await prisma.stat.create({ data: { valueEn: "40%", valueAr: "٤٠٪", labelEn: "Saved", labelAr: "موفر", sortOrder: 0 } });

    const bundle = await request(testApp()).get("/api/v1/content/bundle").expect(200);

    const blog = await request(testApp()).get("/api/v1/content/blog").expect(200);
    const products = await request(testApp()).get("/api/v1/content/products").expect(200);
    const stats = await request(testApp()).get("/api/v1/content/stats").expect(200);

    expect(bundle.body.data.blogPosts).toEqual(blog.body.data);
    expect(bundle.body.data.products).toEqual(products.body.data);
    expect(bundle.body.data.stats).toEqual(stats.body.data);
  });

  it("excludes drafts just as the blog list does", async () => {
    await seedBlogPost({ slug: "published-one" });
    await seedBlogPost({ slug: "draft-one", published: false });

    const response = await request(testApp()).get("/api/v1/content/bundle").expect(200);
    expect(response.body.data.blogPosts.map((post: { slug: string }) => post.slug)).toEqual(["published-one"]);
  });
});
