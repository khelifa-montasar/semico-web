import type { Prisma } from "@prisma/client";

export const APPROVED_TEAM = [
  {
    id: "khelifa-montasar",
    initials: "KM",
    name: "Khelifa Montasar",
    roleEn: "Founder & CEO",
    roleAr: "المؤسس والمدير العام",
    bioEn:
      "Physicist specializing in dielectric materials and semiconductors (M.Sc., USTHB). His Master 2 research on low-cost TDR sensors for multi-level smart irrigation is the scientific foundation of Semico's sensing technology. He leads sensor R&D, the AI data platform, and product strategy.",
    bioAr:
      "فيزيائي متخصص في المواد العازلة وأشباه الموصلات (ماستر فيزياء المواد، USTHB). بحثه حول مستشعرات TDR منخفضة التكلفة للري الذكي متعدد المستويات هو الأساس العلمي لتقنية الاستشعار في سيميكو. يقود تطوير المستشعرات ومنصة تحليل البيانات واستراتيجية المنتج.",
    linkedinUrl: null,
    sortOrder: 0,
  },
  {
    id: "benrakaa-nasser",
    initials: "BN",
    name: "Benrakaa Nasser",
    roleEn: "Supervising Professor — Materials Science, USTHB",
    roleAr: "الأستاذ المشرف والموجه — أستاذ علوم المواد، USTHB",
    bioEn:
      "Professor of materials science at USTHB and the supervising and mentoring professor of the Semico project, guiding the scientific direction of its nanostructured sensing research.",
    bioAr:
      "أستاذ علوم المواد بجامعة هواري بومدين للعلوم والتكنولوجيا، والأستاذ المشرف والموجه لمشروع سيميكو، يشرف على التوجيه العلمي لأبحاث المستشعرات النانوية.",
    linkedinUrl: null,
    sortOrder: 1,
  },
] satisfies Prisma.TeamMemberCreateManyInput[];

export const APPROVED_STATS = [
  {
    id: "water-savings-target",
    valueEn: "50%",
    valueAr: "50%",
    labelEn: "Water-savings target",
    labelAr: "توفير المياه حتى 50%",
    sortOrder: 0,
  },
  {
    id: "productivity-target",
    valueEn: "+30%",
    valueAr: "+30%",
    labelEn: "Productivity target",
    labelAr: "زيادة الإنتاجية حتى 30%",
    sortOrder: 1,
  },
  {
    id: "lower-cost-target",
    valueEn: "60%",
    valueAr: "60%",
    labelEn: "Lower-cost target vs imported",
    labelAr: "تكلفة أقل بـ 60% من المستورد",
    sortOrder: 2,
  },
  {
    id: "usthb-techinnov-incubation",
    valueEn: "USTHB",
    valueAr: "USTHB",
    labelEn: "Incubated at USTHB-TECHINNOV",
    labelAr: "محتضن رسمياً في حاضنة USTHB-TECHINNOV",
    sortOrder: 3,
  },
] satisfies Prisma.StatCreateManyInput[];

export const APPROVED_TESTIMONIALS: Prisma.TestimonialCreateManyInput[] = [];
