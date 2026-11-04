import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBlogPostSchema,
  createPricingPlanSchema,
  updateBlogPostSchema,
  updatePricingPlanSchema,
  type AdminBlogPost,
  type AuthUser,
  type PricingPlan,
} from "@semico/shared";
import { adminApi } from "../../src/api/admin";
import { queryKeys } from "../../src/api/queryKeys";
import {
  useAdminBlog,
  useAdminPricing,
  useBlogMutations,
  usePricingMutations,
} from "../../src/features/admin/useAdminCms";
import { usePricingPlans } from "../../src/features/content/useContent";
import {
  blogFormDefaults,
  blogFormInput,
  pricingFormDefaults,
  pricingFormInput,
} from "../../src/features/admin/cmsForms";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  invalidateQueries: vi.fn(),
  api: {
    get: vi.fn(),
    getPage: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("../../src/features/auth/AuthContext", () => ({
  useAuth: mocks.useAuth,
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: mocks.useQuery,
  useMutation: mocks.useMutation,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock("../../src/lib/api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/api/http")>()),
  api: mocks.api,
}));

const admin: AuthUser = {
  id: "admin",
  email: "admin@test.dz",
  fullName: "Admin",
  initials: "AD",
  role: "SUPER_ADMIN",
  status: "ACTIVE",
  workerType: null,
  valveControl: false,
  farmId: null,
  farmName: null,
  avatarUrl: null,
  phone: null,
  wilayaId: null,
  commune: null,
  bio: null,
};
const plan: PricingPlan = {
  id: "plan",
  name: { en: "Farm", ar: "المزرعة" },
  price: 2500.5,
  currency: "DZD",
  features: [{ en: "Alerts", ar: "التنبيهات" }],
  isActive: false,
};
const post: AdminBlogPost = {
  id: "post",
  slug: "soil-moisture",
  publishedAt: "2026-11-03T23:45:00.000Z",
  category: "GUIDES",
  categoryLabel: { en: "Guides", ar: "الأدلة" },
  title: { en: "Soil moisture", ar: "رطوبة التربة" },
  excerpt: { en: "A guide", ar: "دليل" },
  body: { en: "English content", ar: "المحتوى العربي" },
  coverImageUrl: null,
  published: false,
  sortOrder: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({ user: admin, status: "authenticated" });
  mocks.invalidateQueries.mockResolvedValue(undefined);
  for (const method of Object.values(mocks.api)) method.mockResolvedValue({});
});

describe("bilingual CMS form data", () => {
  it("round-trips pricing and clones feature pairs without changing status or precision", () => {
    const form = pricingFormDefaults(plan);
    expect(createPricingPlanSchema.parse(pricingFormInput(form))).toEqual({
      nameEn: "Farm",
      nameAr: "المزرعة",
      price: 2500.5,
      currency: "DZD",
      features: plan.features,
      isActive: false,
    });
    form.features[0]!.en = "Changed";
    expect(plan.features[0]!.en).toBe("Alerts");
  });
  it("rejects an empty price instead of turning it into a free plan", () => {
    const form = pricingFormDefaults(plan);
    expect(
      createPricingPlanSchema.safeParse(
        pricingFormInput({ ...form, price: "" }),
      ).success,
    ).toBe(false);
    expect(
      createPricingPlanSchema.parse(pricingFormInput({ ...form, price: "0" }))
        .price,
    ).toBe(0);
  });
  it("preserves both blog languages and the original publish time when the date is unchanged", () => {
    const input = createBlogPostSchema.parse(
      blogFormInput(blogFormDefaults(post), post),
    );
    expect(input).toMatchObject({
      titleEn: post.title.en,
      titleAr: post.title.ar,
      bodyEn: post.body!.en,
      bodyAr: post.body!.ar,
      publishedAt: post.publishedAt,
      published: false,
      sortOrder: 2,
    });
  });
  it("changes dates in UTC and keeps newly created articles as drafts", () => {
    const form = blogFormDefaults(post);
    expect(
      blogFormInput({ ...form, publishedDate: "2026-12-04" }, post).publishedAt,
    ).toBe("2026-12-04T00:00:00.000Z");
    expect(blogFormDefaults().published).toBe(false);
    expect(blogFormDefaults({ ...post, body: null }).bodyAr).toBe("");
  });
  it("requires bilingual names, titles, features, and article content", () => {
    expect(
      createPricingPlanSchema.safeParse({
        ...pricingFormInput(pricingFormDefaults(plan)),
        nameAr: "",
      }).success,
    ).toBe(false);
    expect(
      createPricingPlanSchema.safeParse({
        ...pricingFormInput(pricingFormDefaults(plan)),
        features: [{ en: "Only English" }],
      }).success,
    ).toBe(false);
    expect(
      createBlogPostSchema.safeParse({
        ...blogFormInput(blogFormDefaults(post)),
        bodyAr: "",
      }).success,
    ).toBe(false);
  });
  it("does not apply creation defaults to partial updates", () => {
    expect(updatePricingPlanSchema.parse({ price: 5 })).toEqual({ price: 5 });
    expect(updateBlogPostSchema.parse({ titleEn: "Updated" })).toEqual({
      titleEn: "Updated",
    });
    expect(updatePricingPlanSchema.safeParse({}).success).toBe(false);
    expect(updateBlogPostSchema.safeParse({}).success).toBe(false);
  });
});

describe("CMS clients and authorization-aware queries", () => {
  it("uses paginated admin endpoints and encodes resource IDs on edits and deletes", async () => {
    await adminApi.pricing(2);
    await adminApi.blog(3);
    expect(mocks.api.getPage).toHaveBeenCalledWith("/admin/pricing?page=2");
    expect(mocks.api.getPage).toHaveBeenCalledWith("/admin/blog?page=3");
    await adminApi.updatePricing("plan/a", { isActive: false });
    await adminApi.deletePricing("plan/a");
    expect(mocks.api.patch).toHaveBeenCalledWith("/admin/pricing/plan%2Fa", {
      isActive: false,
    });
    expect(mocks.api.delete).toHaveBeenCalledWith("/admin/pricing/plan%2Fa");
    await adminApi.updateBlog("post/a", { published: false });
    await adminApi.deleteBlog("post/a");
    expect(mocks.api.patch).toHaveBeenCalledWith("/admin/blog/post%2Fa", {
      published: false,
    });
    expect(mocks.api.delete).toHaveBeenCalledWith("/admin/blog/post%2Fa");
  });
  it("keys private list caches by admin identity and page and removes them after unmount", () => {
    useAdminPricing(2);
    useAdminBlog(3);
    expect(mocks.useQuery.mock.calls[0]![0]).toMatchObject({
      queryKey: queryKeys.admin.pricing(admin.id, 2),
      enabled: true,
      gcTime: 0,
    });
    expect(mocks.useQuery.mock.calls[1]![0]).toMatchObject({
      queryKey: queryKeys.admin.blog(admin.id, 3),
      enabled: true,
      gcTime: 0,
    });
    expect(queryKeys.admin.pricing("another", 2)).not.toEqual(
      queryKeys.admin.pricing(admin.id, 2),
    );
  });
  it.each(["OWNER", "WORKER"] as const)(
    "never enables CMS queries for %s users",
    (role) => {
      mocks.useAuth.mockReturnValue({
        user: { ...admin, role },
        status: "authenticated",
      });
      useAdminPricing(1);
      useAdminBlog(1);
      for (const [options] of mocks.useQuery.mock.calls)
        expect(options.enabled).toBe(false);
    },
  );
  it.each(["DISABLED", "INVITED"] as const)(
    "never enables CMS queries for %s super admins",
    (status) => {
      mocks.useAuth.mockReturnValue({
        user: { ...admin, status },
        status: "authenticated",
      });
      useAdminPricing(1);
      useAdminBlog(1);
      for (const [options] of mocks.useQuery.mock.calls)
        expect(options.enabled).toBe(false);
    },
  );
  it("loads public pricing without requiring a session", async () => {
    mocks.useAuth.mockReturnValue({ user: null, status: "anonymous" });
    usePricingPlans();
    const options = mocks.useQuery.mock.calls[0]![0];
    expect(options).toMatchObject({
      queryKey: queryKeys.content.pricing(),
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    });
    await options.queryFn();
    expect(mocks.api.get).toHaveBeenCalledWith("/content/pricing-plans");
  });
});

describe("CMS mutations keep admin and public caches synchronized", () => {
  it("creates, edits, toggles, and deletes plans and invalidates affected lists", async () => {
    usePricingMutations();
    const [save, toggle, remove] = mocks.useMutation.mock.calls.map(
      ([options]) => options,
    );
    const input = createPricingPlanSchema.parse(
      pricingFormInput(pricingFormDefaults(plan)),
    );
    await save.mutationFn({ input });
    expect(mocks.api.post).toHaveBeenCalledWith("/admin/pricing", input);
    await save.mutationFn({ id: plan.id, input });
    expect(mocks.api.patch).toHaveBeenCalledWith("/admin/pricing/plan", input);
    await toggle.mutationFn({ id: plan.id, isActive: true });
    expect(mocks.api.patch).toHaveBeenCalledWith("/admin/pricing/plan", {
      isActive: true,
    });
    await remove.mutationFn(plan.id);
    expect(mocks.api.delete).toHaveBeenCalledWith("/admin/pricing/plan");
    for (const options of [save, toggle, remove]) {
      mocks.invalidateQueries.mockClear();
      await options.onSuccess();
      expect(mocks.invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.admin.pricingAll,
      });
      expect(mocks.invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.content.pricing(),
      });
    }
  });
  it("creates, edits, and deletes posts and invalidates public summaries and article caches", async () => {
    useBlogMutations();
    const [save, remove] = mocks.useMutation.mock.calls.map(
      ([options]) => options,
    );
    const input = createBlogPostSchema.parse(
      blogFormInput(blogFormDefaults(post), post),
    );
    await save.mutationFn({ input });
    expect(mocks.api.post).toHaveBeenCalledWith("/admin/blog", input);
    await save.mutationFn({ id: post.id, input });
    expect(mocks.api.patch).toHaveBeenCalledWith("/admin/blog/post", input);
    await remove.mutationFn(post.id);
    expect(mocks.api.delete).toHaveBeenCalledWith("/admin/blog/post");
    for (const options of [save, remove]) {
      mocks.invalidateQueries.mockClear();
      await options.onSuccess();
      expect(mocks.invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.admin.blogAll,
      });
      expect(mocks.invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.content.all,
      });
    }
  });
});
