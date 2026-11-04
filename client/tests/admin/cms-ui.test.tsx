import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AdminBlogPost, PricingPlan } from "@semico/shared";
import { translations } from "../../src/app/i18n/translations";
import { AdminPricing } from "../../src/app/components/pages/AdminPricing";
import { AdminBlog } from "../../src/app/components/pages/AdminBlog";
import { Services } from "../../src/app/components/pages/Services";
import { PricingPlanForm } from "../../src/features/admin/PricingPlanForm";
import { BlogPostForm } from "../../src/features/admin/BlogPostForm";
import { CmsPagination } from "../../src/features/admin/CmsControls";
import { readSource } from "../helpers/source";

const mocks = vi.hoisted(() => ({
  useLanguage: vi.fn(),
  useAdminPricing: vi.fn(),
  useAdminBlog: vi.fn(),
  usePricingPlans: vi.fn(),
  usePricingMutations: vi.fn(),
  useBlogMutations: vi.fn(),
}));
vi.mock("../../src/app/contexts/LanguageContext", () => ({
  useLanguage: mocks.useLanguage,
}));
vi.mock("../../src/features/admin/useAdminCms", () => ({
  useAdminPricing: mocks.useAdminPricing,
  useAdminBlog: mocks.useAdminBlog,
  usePricingMutations: mocks.usePricingMutations,
  useBlogMutations: mocks.useBlogMutations,
}));
vi.mock("../../src/features/content/useContent", () => ({
  usePricingPlans: mocks.usePricingPlans,
}));
vi.mock("../../src/features/leads/useLeads", () => ({
  useCreateLead: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../src/app/components/ConsultationBooking", () => ({
  ConsultationBooking: () => null,
}));

const plan: PricingPlan = {
  id: "plan",
  name: { en: "CMS farm plan", ar: "خطة المزرعة من الإدارة" },
  price: 4321.5,
  currency: "DZD",
  isActive: true,
  features: [
    { en: "Database-driven monitoring", ar: "مراقبة من قاعدة البيانات" },
  ],
};
const post: AdminBlogPost = {
  id: "post",
  slug: "soil-moisture",
  publishedAt: "2026-11-03T23:45:00.000Z",
  category: "GUIDES",
  categoryLabel: { en: "Guides", ar: "الأدلة" },
  title: { en: "Soil moisture", ar: "رطوبة التربة" },
  excerpt: { en: "A guide", ar: "دليل" },
  body: { en: "English article content", ar: "المحتوى العربي للمقال" },
  coverImageUrl: null,
  published: false,
  sortOrder: 2,
};
const meta = { page: 1, pageSize: 20, total: 2, totalPages: 1 };
const mutation = () => ({
  mutate: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  isError: false,
  error: null,
});

function language(lang: "en" | "ar") {
  mocks.useLanguage.mockReturnValue({
    lang,
    t: translations[lang],
    isRTL: lang === "ar",
    font: "sans-serif",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  language("en");
  mocks.useAdminPricing.mockReturnValue({
    data: {
      data: [
        plan,
        {
          ...plan,
          id: "inactive",
          name: { en: "Inactive plan", ar: "خطة غير نشطة" },
          isActive: false,
        },
      ],
      meta,
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  mocks.useAdminBlog.mockReturnValue({
    data: {
      data: [
        post,
        {
          ...post,
          id: "published",
          title: { en: "Published article", ar: "مقال منشور" },
          published: true,
        },
      ],
      meta,
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  mocks.usePricingPlans.mockReturnValue({
    data: [plan],
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  });
  mocks.usePricingMutations.mockReturnValue({
    save: mutation(),
    toggle: mutation(),
    remove: mutation(),
  });
  mocks.useBlogMutations.mockReturnValue({
    save: mutation(),
    remove: mutation(),
  });
});

describe("admin pricing and blog screens", () => {
  it("lists active and inactive pricing with create, edit, delete, and status controls", () => {
    const html = renderToStaticMarkup(<AdminPricing />);
    for (const text of [
      plan.name.en,
      "Inactive plan",
      "Create plan",
      "Edit",
      "Delete",
      "Activate",
      "Deactivate",
    ])
      expect(html).toContain(text);
    expect(html).toContain('aria-label="Pricing plans"');
  });
  it("lists both drafts and published articles", () => {
    const html = renderToStaticMarkup(<AdminBlog />);
    for (const text of [
      post.title.en,
      "Published article",
      "Draft",
      "Published",
      "Create post",
      "Edit",
      "Delete",
    ])
      expect(html).toContain(text);
    expect(html).toMatch(/datetime="2026-11-03T23:45:00.000Z"/i);
  });
  it("hides stale private pricing when a list request fails", () => {
    mocks.useAdminPricing.mockReturnValue({
      data: { data: [plan], meta },
      isError: true,
      refetch: vi.fn(),
    });
    const html = renderToStaticMarkup(<AdminPricing />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Try again");
    expect(html).not.toContain(plan.name.en);
  });
  it("hides stale article titles when a list request fails", () => {
    mocks.useAdminBlog.mockReturnValue({
      data: { data: [post], meta },
      isError: true,
      refetch: vi.fn(),
    });
    const html = renderToStaticMarkup(<AdminBlog />);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain(post.title.en);
  });
  it("distinguishes loading from empty lists", () => {
    mocks.useAdminPricing.mockReturnValue({
      isPending: true,
      refetch: vi.fn(),
    });
    expect(renderToStaticMarkup(<AdminPricing />)).toContain('role="status"');
    expect(renderToStaticMarkup(<AdminPricing />)).not.toContain(
      "No pricing plans yet.",
    );
    mocks.useAdminBlog.mockReturnValue({
      data: { data: [], meta },
      refetch: vi.fn(),
    });
    expect(renderToStaticMarkup(<AdminBlog />)).toContain("No blog posts yet.");
  });
  it("renders admin text and records in Arabic", () => {
    language("ar");
    expect(renderToStaticMarkup(<AdminPricing />)).toContain(plan.name.ar);
    expect(renderToStaticMarkup(<AdminBlog />)).toContain(post.title.ar);
    expect(renderToStaticMarkup(<AdminBlog />)).toContain(
      translations.ar.admin.cms.addPost,
    );
  });
  it("provides paginated navigation", () => {
    const html = renderToStaticMarkup(
      <CmsPagination
        meta={{ ...meta, page: 2, totalPages: 3 }}
        busy={false}
        onPageChange={vi.fn()}
      />,
    );
    expect(html).toContain("Page 2 of 3");
    expect(html).toContain("Previous");
    expect(html).toContain("Next");
  });
  it("keeps new CMS routes lazy and inside the existing protected admin tree", () => {
    const routes = readSource("src/app/routes.tsx").text;
    expect(routes).toContain('import("./components/pages/AdminPricing")');
    expect(routes).toContain('import("./components/pages/AdminBlog")');
    expect(routes).toContain('{ path: "pricing", Component: AdminPricing }');
    expect(routes).toContain('{ path: "blog", Component: AdminBlog }');
    expect(routes).toContain("Component: RequireSuperAdmin");
    const layout = readSource("src/app/components/AdminLayout.tsx").text;
    expect(layout).toContain('to: "/admin/pricing"');
    expect(layout).toContain('to: "/admin/blog"');
  });
});

describe("bilingual pricing and blog editors", () => {
  it("prefills pricing and both languages of each feature with properly directed fields", () => {
    const html = renderToStaticMarkup(
      <PricingPlanForm
        initialPlan={plan}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    for (const text of [
      plan.name.en,
      plan.name.ar,
      plan.features[0]!.en,
      plan.features[0]!.ar,
      "Add feature",
      "Remove feature",
    ])
      expect(html).toContain(text);
    expect(
      html.match(/<input(?=[^>]*lang="ar")(?=[^>]*required)[^>]*>/g),
    ).toHaveLength(2);
    expect(html).toContain('dir="rtl"');
  });
  it("prefills bilingual titles and full content and offers publishing controls", () => {
    const html = renderToStaticMarkup(
      <BlogPostForm initialPost={post} onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    for (const text of [
      post.title.en,
      post.title.ar,
      post.body!.en,
      post.body!.ar,
      "Publish post",
      "soil-moisture",
      "2026-11-03",
    ])
      expect(html).toContain(text);
    expect(
      html.match(/<textarea(?=[^>]*lang="ar")(?=[^>]*required)[^>]*>/g),
    ).toHaveLength(1);
    expect(
      html.match(/<textarea(?=[^>]*lang="en")(?=[^>]*required)[^>]*>/g),
    ).toHaveLength(1);
  });
  it("disables editor fields during a save and displays save errors", () => {
    const html = renderToStaticMarkup(
      <BlogPostForm
        pending
        error="Duplicate slug"
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(html).toContain('<fieldset disabled=""');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Duplicate slug");
  });
  it("escapes article content rather than executing HTML in the editor", () => {
    const html = renderToStaticMarkup(
      <BlogPostForm
        initialPost={{
          ...post,
          body: { en: "<script>alert(1)</script>", ar: "المحتوى" },
        }}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("services uses live pricing, not legacy service plans", () => {
  it("renders database names, prices, currencies, and features, and hides inactive plans", () => {
    mocks.usePricingPlans.mockReturnValue({
      data: [
        plan,
        {
          ...plan,
          id: "hidden",
          name: { en: "Hidden plan", ar: "خطة مخفية" },
          isActive: false,
        },
      ],
      isSuccess: true,
    });
    const html = renderToStaticMarkup(<Services />);
    expect(html).toContain(plan.name.en);
    expect(html).toContain(plan.features[0]!.en);
    expect(html).toContain(
      new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "DZD",
      }).format(plan.price),
    );
    expect(html).not.toContain("Hidden plan");
    expect(html).toContain("Get started");
    expect(html).toContain("Contact us");
    expect(
      readSource("src/app/components/pages/Services.tsx").text,
    ).not.toContain("servicePlans");
  });
  it("uses Arabic database values when the language changes", () => {
    language("ar");
    const html = renderToStaticMarkup(<Services />);
    expect(html).toContain(plan.name.ar);
    expect(html).toContain(plan.features[0]!.ar);
    expect(html).not.toContain(plan.name.en);
  });
  it("renders free plans instead of treating zero as missing", () => {
    mocks.usePricingPlans.mockReturnValue({
      data: [{ ...plan, price: 0 }],
      isSuccess: true,
    });
    expect(renderToStaticMarkup(<Services />)).toContain(
      new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "DZD",
      }).format(0),
    );
  });
  it("shows loading without substituting hardcoded prices", () => {
    mocks.usePricingPlans.mockReturnValue({ isPending: true });
    const html = renderToStaticMarkup(<Services />);
    expect(html).toContain("Loading pricing plans");
    expect(html).not.toContain(plan.name.en);
    expect(html).not.toContain("No active plans");
  });
  it("offers retries and hides stale prices after a failed request", () => {
    mocks.usePricingPlans.mockReturnValue({
      data: [plan],
      isError: true,
      refetch: vi.fn(),
    });
    const html = renderToStaticMarkup(<Services />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Try again");
    expect(html).not.toContain(plan.name.en);
  });
  it("shows an empty state without inventing fallback plans", () => {
    mocks.usePricingPlans.mockReturnValue({ data: [], isSuccess: true });
    const html = renderToStaticMarkup(<Services />);
    expect(html).toContain("No active plans are available.");
    expect(html).not.toContain("Residential");
    expect(html).toContain("Tailored solutions");
  });
});
