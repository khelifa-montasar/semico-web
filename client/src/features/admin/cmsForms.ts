import type {
  AdminBlogPost,
  BlogCategory,
  Localized,
  PricingPlan,
} from "@semico/shared";

export interface PricingFormState {
  nameEn: string;
  nameAr: string;
  price: string;
  currency: string;
  features: Localized[];
  isActive: boolean;
}

export function pricingFormDefaults(plan?: PricingPlan): PricingFormState {
  return {
    nameEn: plan?.name.en ?? "",
    nameAr: plan?.name.ar ?? "",
    price: plan ? String(plan.price) : "",
    currency: plan?.currency ?? "DZD",
    features: plan?.features.map((feature) => ({ ...feature })) ?? [],
    isActive: plan?.isActive ?? true,
  };
}

export function pricingFormInput(form: PricingFormState) {
  return {
    ...form,
    price: form.price.trim() === "" ? NaN : Number(form.price),
  };
}

export interface BlogFormState {
  slug: string;
  titleEn: string;
  titleAr: string;
  excerptEn: string;
  excerptAr: string;
  bodyEn: string;
  bodyAr: string;
  category: BlogCategory;
  publishedDate: string;
  published: boolean;
  coverImageUrl: string;
  sortOrder: string;
}

export function blogFormDefaults(post?: AdminBlogPost): BlogFormState {
  return {
    slug: post?.slug ?? "",
    titleEn: post?.title.en ?? "",
    titleAr: post?.title.ar ?? "",
    excerptEn: post?.excerpt.en ?? "",
    excerptAr: post?.excerpt.ar ?? "",
    bodyEn: post?.body?.en ?? "",
    bodyAr: post?.body?.ar ?? "",
    category: post?.category ?? "TECHNOLOGY",
    publishedDate: (post?.publishedAt ?? new Date().toISOString()).slice(0, 10),
    published: post?.published ?? false,
    coverImageUrl: post?.coverImageUrl ?? "",
    sortOrder: String(post?.sortOrder ?? 0),
  };
}

export function blogFormInput(form: BlogFormState, original?: AdminBlogPost) {
  const { publishedDate, coverImageUrl, sortOrder, ...fields } = form;
  return {
    ...fields,
    publishedAt:
      original?.publishedAt.slice(0, 10) === publishedDate
        ? original.publishedAt
        : `${publishedDate}T00:00:00.000Z`,
    coverImageUrl: coverImageUrl.trim() || null,
    sortOrder: sortOrder.trim() === "" ? NaN : Number(sortOrder),
  };
}
