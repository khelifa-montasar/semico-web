import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { ContentBundle } from "@semico/shared";
import {
  APPROVED_STATS,
  APPROVED_TEAM,
} from "../../../server/prisma/seeds/landing-content-data";
import { translations } from "../../src/app/i18n/translations";
import { About } from "../../src/app/components/pages/About";
import { Home } from "../../src/app/components/pages/Home";

const mocks = vi.hoisted(() => ({
  useLanguage: vi.fn(),
  useContentBundle: vi.fn(),
}));
vi.mock("../../src/app/contexts/LanguageContext", () => ({
  useLanguage: mocks.useLanguage,
}));
vi.mock("../../src/features/content/useContent", () => ({
  useContentBundle: mocks.useContentBundle,
}));
vi.mock("../../src/app/components/ConsultationBooking", () => ({
  ConsultationBooking: () => null,
}));

const approvedBundle: ContentBundle = {
  blogPosts: [],
  products: [],
  servicePlans: [],
  team: APPROVED_TEAM.map((member) => ({
    id: member.id,
    initials: member.initials,
    name: member.name,
    role: { en: member.roleEn, ar: member.roleAr },
    bio: { en: member.bioEn, ar: member.bioAr },
    linkedinUrl: null,
    sortOrder: member.sortOrder,
  })),
  stats: APPROVED_STATS.map((stat) => ({
    id: stat.id,
    value: { en: stat.valueEn, ar: stat.valueAr },
    label: { en: stat.labelEn, ar: stat.labelAr },
    sortOrder: stat.sortOrder,
  })),
  testimonials: [],
};

function language(lang: "en" | "ar") {
  mocks.useLanguage.mockReturnValue({
    lang,
    t: translations[lang],
    isRTL: lang === "ar",
    font: "sans-serif",
  });
}

function text(value: string) {
  return renderToStaticMarkup(<>{value}</>);
}

beforeEach(() => {
  vi.clearAllMocks();
  language("en");
  mocks.useContentBundle.mockReturnValue({
    data: approvedBundle,
    isError: false,
  });
});

describe("approved public landing content", () => {
  it("renders the two exact profiles using initials, not photos or invented links", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    );
    for (const member of APPROVED_TEAM) {
      expect(html).toContain(text(member.name));
      expect(html).toContain(text(member.roleEn));
      expect(html).toContain(text(member.bioEn));
      expect(html).toContain(`>${member.initials}<`);
    }
    expect(html).not.toContain("<img");
    expect(html).not.toContain("linkedin.com");
    expect(html).not.toContain("mailto:");
    expect(html).not.toContain("tel:");
  });

  it("labels percentage figures as design targets rather than field results", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    );
    expect(html).toContain("Design targets and incubation");
    expect(html).toContain(
      "Percentage figures are design targets, not measured field results.",
    );
    for (const stat of APPROVED_STATS)
      expect(html).toContain(text(stat.labelEn));
    expect(html).not.toContain("2,400+");
    expect(html).not.toContain("12M");
    expect(html).not.toContain("98%");
  });

  it("renders approved Arabic bios, roles, labels and LTR percentage tokens in RTL", () => {
    language("ar");
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    );
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("أهداف التصميم والاحتضان");
    expect(html).toContain(
      "النسب المعروضة أهداف تصميمية، وليست نتائج ميدانية مقاسة.",
    );
    for (const member of APPROVED_TEAM) {
      expect(html).toContain(text(member.roleAr));
      expect(html).toContain(text(member.bioAr));
    }
    for (const stat of APPROVED_STATS)
      expect(html).toContain(text(stat.labelAr));
    expect(html).toContain('<bdi dir="ltr">+30%</bdi>');
  });

  it("omits the empty testimonial section without leaving its blank spacing", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );
    expect(html).not.toContain("pb-20");
    expect(html).not.toContain("Karim B.");
    expect(html).not.toContain("Amira T.");
  });

  it("keeps testimonial-load errors visible instead of concealing them", () => {
    mocks.useContentBundle.mockReturnValue({
      data: undefined,
      isError: true,
      error: new Error("Content unavailable"),
    });
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );
    expect(html).toContain("Content unavailable");
  });

  it("does not show an empty design-target section when data is absent", () => {
    mocks.useContentBundle.mockReturnValue({
      data: { ...approvedBundle, stats: [] },
      isError: false,
    });
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    );
    expect(html).not.toContain("design-targets-heading");
  });
});
