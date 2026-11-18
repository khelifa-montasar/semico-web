import type { Prisma, PrismaClient } from "@prisma/client";
import {
  BLOG_POSTS,
  PRODUCTS,
  SERVICE_PLANS,
  WILAYAS,
} from "./content-data.js";

async function contentCounts(client: Prisma.TransactionClient) {
  return {
    Wilaya: await client.wilaya.count(),
    ServicePlan: await client.servicePlan.count(),
    PricingPlan: await client.pricingPlan.count(),
    Product: await client.product.count(),
    BlogPost: await client.blogPost.count(),
  };
}

function contentId(kind: string, name: string): string {
  return `content-${kind}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function pricingData(plan: (typeof SERVICE_PLANS)[number]) {
  if (plan.priceValue === null) return null;
  return {
    id: contentId("pricing", plan.titleEn),
    nameEn: plan.titleEn,
    nameAr: plan.titleAr,
    price: plan.priceValue,
    currency: "DZD",
    featuresJson: JSON.stringify([
      { en: plan.descEn, ar: plan.descAr },
      ...(plan.unitEn && plan.unitAr
        ? [{ en: plan.unitEn, ar: plan.unitAr }]
        : []),
      ...(plan.badgeEn && plan.badgeAr
        ? [{ en: plan.badgeEn, ar: plan.badgeAr }]
        : []),
    ]),
    isActive: true,
  };
}

export function publicContentSummary() {
  return [
    {
      table: "Wilaya",
      count: WILAYAS.length,
      names: WILAYAS.map(([code, name]) => `${code} ${name}`),
      source: "Public WILAYAS definitions in server/prisma/seed.ts",
    },
    {
      table: "ServicePlan",
      count: SERVICE_PLANS.length,
      names: SERVICE_PLANS.map((plan) => plan.titleEn),
      source: "Public SERVICE_PLANS definitions in server/prisma/seed.ts",
    },
    {
      table: "PricingPlan",
      count: SERVICE_PLANS.filter((plan) => plan.priceValue !== null).length,
      names: SERVICE_PLANS.filter((plan) => plan.priceValue !== null).map(
        (plan) => plan.titleEn,
      ),
      source: "Pricing derivation from public SERVICE_PLANS definitions",
    },
    {
      table: "Product",
      count: PRODUCTS.length,
      names: PRODUCTS.map((product) => product.titleEn),
      source: "Public PRODUCTS definitions in server/prisma/seed.ts",
    },
    {
      table: "BlogPost",
      count: BLOG_POSTS.length,
      names: BLOG_POSTS.map((post) => post.titleEn),
      source: "Public BLOG_POSTS definitions in server/prisma/seed.ts",
    },
  ];
}

export async function seedPublicContent(client: PrismaClient) {
  return client.$transaction(
    async (transaction) => {
      const before = await contentCounts(transaction);

      for (const [code, name] of WILAYAS) {
        await transaction.wilaya.upsert({
          where: { code },
          create: { code, nameEn: name, nameAr: name, covered: true },
          update: {},
        });
      }

      for (const plan of SERVICE_PLANS) {
        const existing = await transaction.servicePlan.findFirst({
          where: { titleEn: plan.titleEn },
          select: { id: true },
        });
        await transaction.servicePlan.upsert({
          where: { id: existing?.id ?? contentId("service", plan.titleEn) },
          create: { ...plan, id: contentId("service", plan.titleEn) },
          update: {},
        });

        const pricing = pricingData(plan);
        if (!pricing) continue;
        const existingPricing = await transaction.pricingPlan.findFirst({
          where: { nameEn: pricing.nameEn },
          select: { id: true },
        });
        await transaction.pricingPlan.upsert({
          where: { id: existingPricing?.id ?? pricing.id },
          create: pricing,
          update: {},
        });
      }

      for (const product of PRODUCTS) {
        const existing = await transaction.product.findFirst({
          where: { titleEn: product.titleEn },
          select: { id: true },
        });
        await transaction.product.upsert({
          where: { id: existing?.id ?? contentId("product", product.titleEn) },
          create: {
            ...product,
            id: contentId("product", product.titleEn),
            imageUrl: null,
          },
          update: {},
        });
      }

      for (const post of BLOG_POSTS) {
        await transaction.blogPost.upsert({
          where: { slug: post.slug },
          create: {
            ...post,
            publishedAt: new Date(`${post.publishedAt}T00:00:00.000Z`),
            published: true,
            coverImageUrl: null,
          },
          update: {},
        });
      }

      return { before, after: await contentCounts(transaction) };
    },
    { timeout: 30_000 },
  );
}
