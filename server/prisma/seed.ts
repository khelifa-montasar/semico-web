import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

/**
 * Seeds the database with the content that currently lives hardcoded in the client.
 *
 * Everything here is a faithful port of `client/src/app/i18n/translations.ts` and the mock
 * constants in `Settings.tsx` — the blog posts, product catalogue, service plans, team, stats,
 * testimonials, the 58 wilayas, the 7 diagnostic cards, the 3 error-log rows and the 7 activity
 * rows — plus a demo farm with realistic telemetry so the dashboard has something to render.
 *
 * Every translatable row carries BOTH languages, so switching locale in the UI never refetches.
 *
 * This is demo data, not real farm data.
 */

const prisma = new PrismaClient();

// ── demo credentials ─────────────────────────────────────────────────────────
// Documented in server/README.md. Change before any real deployment.
const DEMO_PASSWORD = "Semico2026!";
const DEMO_OWNER_EMAIL = "owner@semico.dz";
/** Deterministic so the demo is reproducible; real farms get a random code at signup. */
const DEMO_OWNER_CODE = "SEMI-CO26";

// ── reference: the 58 Algerian wilayas ───────────────────────────────────────
// The source UI renders these in Latin script in both locales, so nameAr mirrors nameEn rather
// than inventing transliterations. Swapping in proper Arabic names later is a data-only change.
const WILAYAS: Array<[code: string, name: string]> = [
  ["01", "Adrar"], ["02", "Chlef"], ["03", "Laghouat"], ["04", "Oum El Bouaghi"],
  ["05", "Batna"], ["06", "Béjaïa"], ["07", "Biskra"], ["08", "Béchar"],
  ["09", "Blida"], ["10", "Bouira"], ["11", "Tamanrasset"], ["12", "Tébessa"],
  ["13", "Tlemcen"], ["14", "Tiaret"], ["15", "Tizi Ouzou"], ["16", "Alger"],
  ["17", "Djelfa"], ["18", "Jijel"], ["19", "Sétif"], ["20", "Saïda"],
  ["21", "Skikda"], ["22", "Sidi Bel Abbès"], ["23", "Annaba"], ["24", "Guelma"],
  ["25", "Constantine"], ["26", "Médéa"], ["27", "Mostaganem"], ["28", "M'Sila"],
  ["29", "Mascara"], ["30", "Ouargla"], ["31", "Oran"], ["32", "El Bayadh"],
  ["33", "Illizi"], ["34", "Bordj Bou Arréridj"], ["35", "Boumerdès"], ["36", "El Tarf"],
  ["37", "Tindouf"], ["38", "Tissemsilt"], ["39", "El Oued"], ["40", "Khenchela"],
  ["41", "Souk Ahras"], ["42", "Tipaza"], ["43", "Mila"], ["44", "Aïn Defla"],
  ["45", "Naâma"], ["46", "Aïn Témouchent"], ["47", "Ghardaïa"], ["48", "Relizane"],
  ["49", "Timimoun"], ["50", "Bordj Badji Mokhtar"], ["51", "Ouled Djellal"],
  ["52", "Béni Abbès"], ["53", "In Salah"], ["54", "In Guezzam"],
  ["55", "Touggourt"], ["56", "Djanet"], ["57", "El M'Ghair"], ["58", "El Meniaa"],
];

// ── content ──────────────────────────────────────────────────────────────────
const SERVICE_PLANS = [
  { titleEn: "Residential", titleAr: "سكني", priceValue: 2500, unitEn: "DA / m²", unitAr: "دج / م²",
    badgeEn: "1 Month Free Trial", badgeAr: "شهر تجريبي مجاني",
    descEn: "Perfect for home gardens and small plots.", descAr: "مثالي للحدائق المنزلية والقطع الصغيرة.", sortOrder: 0 },
  { titleEn: "Farm", titleAr: "مزرعة", priceValue: 18000, unitEn: "DA / ha", unitAr: "دج / هكتار",
    badgeEn: "1 Month Free Trial", badgeAr: "شهر تجريبي مجاني",
    descEn: "Full-scale smart irrigation for agriculture.", descAr: "نظام ري ذكي متكامل للزراعة.", sortOrder: 1 },
  { titleEn: "Custom", titleAr: "مخصص", priceValue: null, unitEn: null, unitAr: null,
    badgeEn: null, badgeAr: null,
    descEn: "Tailored solutions for unique requirements.", descAr: "حلول مُصمَّمة خصيصاً لمتطلبات فريدة.", sortOrder: 2 },
];

const PRODUCTS = [
  { iconKey: "Cpu", titleEn: "Semico Controller V2", titleAr: "وحدة تحكم سيميكو V2",
    descEn: "Central hub for managing up to 16 irrigation zones with real-time monitoring.",
    descAr: "محور مركزي لإدارة ما يصل إلى 16 منطقة ري مع مراقبة في الوقت الفعلي.", sortOrder: 0 },
  { iconKey: "Droplets", titleEn: "Soil Moisture Sensor", titleAr: "مستشعر رطوبة التربة",
    descEn: "Capacitive sensor measuring moisture at root and surface level.",
    descAr: "مستشعر سعوي يقيس الرطوبة عند مستوى الجذور والسطح.", sortOrder: 1 },
  { iconKey: "Radio", titleEn: "LoRa Gateway", titleAr: "بوابة LoRa",
    descEn: "Long-range wireless bridge connecting field sensors to the controller.",
    descAr: "جسر لاسلكي بعيد المدى يربط مستشعرات الحقل بوحدة التحكم.", sortOrder: 2 },
  { iconKey: "Sun", titleEn: "Solar Power Kit", titleAr: "طقم الطاقة الشمسية",
    descEn: "12V solar panel and battery pack for off-grid installations.",
    descAr: "لوح شمسي 12 فولت وحزمة بطارية للتركيبات خارج الشبكة.", sortOrder: 3 },
  { iconKey: "Gauge", titleEn: "Flow Meter", titleAr: "عداد التدفق",
    descEn: "Precision water flow measurement for consumption tracking.",
    descAr: "قياس دقيق لتدفق المياه لتتبع الاستهلاك.", sortOrder: 4 },
  { iconKey: "Wifi", titleEn: "4G Module", titleAr: "وحدة 4G",
    descEn: "Cellular connectivity add-on for remote farm locations.",
    descAr: "إضافة اتصال خلوي لمواقع المزارع النائية.", sortOrder: 5 },
];

const BLOG_POSTS = [
  { slug: "lora-revolutionizing-algerian-agriculture", publishedAt: "2026-04-10", category: "TECHNOLOGY",
    titleEn: "How LoRa is Revolutionizing Algerian Agriculture", titleAr: "كيف تُحدث LoRa ثورة في الزراعة الجزائرية",
    excerptEn: "Long-range wireless sensors enable monitoring of vast farmlands without cellular coverage.",
    excerptAr: "تتيح المستشعرات اللاسلكية بعيدة المدى مراقبة المزارع الشاسعة دون الحاجة إلى تغطية خلوية." },
  { slug: "optimizing-soil-moisture-thresholds-olive-trees", publishedAt: "2026-03-28", category: "GUIDES",
    titleEn: "Optimizing Soil Moisture Thresholds for Olive Trees", titleAr: "تحسين حدود رطوبة التربة لأشجار الزيتون",
    excerptEn: "A data-driven approach to setting the perfect irrigation thresholds for olive cultivation.",
    excerptAr: "نهج قائم على البيانات لضبط حدود الري المثالية لزراعة الزيتون." },
  { slug: "solar-powered-irrigation-complete-guide", publishedAt: "2026-03-15", category: "TECHNOLOGY",
    titleEn: "Solar-Powered Irrigation: A Complete Guide", titleAr: "الري بالطاقة الشمسية: دليل شامل",
    excerptEn: "Everything you need to know about running your Semico system entirely off-grid.",
    excerptAr: "كل ما تحتاج معرفته لتشغيل نظام سيميكو بالكامل خارج الشبكة الكهربائية." },
  { slug: "soil-drying-rates-arid-climates", publishedAt: "2026-02-20", category: "GUIDES",
    titleEn: "Understanding Soil Drying Rates in Arid Climates", titleAr: "فهم معدلات جفاف التربة في المناخ الجاف",
    excerptEn: "How soil composition and climate affect water retention and optimal watering schedules.",
    excerptAr: "كيف تؤثر تركيبة التربة والمناخ على الاحتفاظ بالماء وجداول الري المثلى." },
];

const STATS = [
  { valueEn: "2,400+", valueAr: "2,400+", labelEn: "Active Systems", labelAr: "نظام نشط", sortOrder: 0 },
  { valueEn: "12M", valueAr: "12M", labelEn: "Liters Saved", labelAr: "لتر موفّر", sortOrder: 1 },
  { valueEn: "38", valueAr: "38", labelEn: "Wilayas Covered", labelAr: "ولاية مشمولة", sortOrder: 2 },
  { valueEn: "98%", valueAr: "98%", labelEn: "Uptime", labelAr: "وقت التشغيل", sortOrder: 3 },
];

const TEAM = [
  { initials: "KM", name: "Khelifa Montasar", roleEn: "Co-Founder & CEO", roleAr: "المؤسس المشارك والرئيس التنفيذي",
    bioEn: "Agricultural engineer with 10+ years of experience in precision irrigation. Passionate about bringing smart farming to every Algerian farmer.",
    bioAr: "مهندس زراعي مع خبرة تزيد عن 10 سنوات في الري الدقيق. متحمس لتقديم الزراعة الذكية لكل مزارع جزائري.",
    linkedinUrl: "https://linkedin.com", sortOrder: 0 },
  { initials: "BN", name: "Benrakaa Nasser", roleEn: "Co-Founder & CTO", roleAr: "المؤسس المشارك والرئيس الفني",
    bioEn: "Electronics and IoT specialist. Leads hardware development and ensures Semico's devices are reliable, low-power, and field-ready.",
    bioAr: "خبير في الإلكترونيات وتقنية المعلومات. يقود تطوير الأجهزة ويضمن أن أجهزة سيميكو موثوقة ومحملة بطاقة ضئيلة ومستعدة للحقل.",
    linkedinUrl: "https://linkedin.com", sortOrder: 1 },
];

const TESTIMONIALS = [
  { quoteEn: "Our water consumption dropped by 40% in the first season. The system practically runs itself.",
    // NOTE: the source Arabic string reads "بنبة 40٪", which looks like a typo for "بنسبة" (by 40%).
    // Corrected here; flagging it rather than silently changing customer-facing copy.
    quoteAr: "انخفض استهلاكنا للمياه بنسبة 40٪ في الموسم الأول. النظام يعمل تقريباً وحده.",
    authorName: "Karim B.", farmEn: "Olive Farm, Tizi Ouzou", farmAr: "مزرعة زيتون، تيزي وزو", sortOrder: 0 },
  { quoteEn: "Finally, a solution built for Algerian farms. Setup was simple and support is excellent.",
    quoteAr: "أخيراً، حلٌّ مصمّم للمزارع الجزائرية. الإعداد بسيط والدعم ممتاز.",
    authorName: "Amira T.", farmEn: "Citrus Grove, Blida", farmAr: "بستان حمضيات، البليدة", sortOrder: 1 },
];

// ── demo farm diagnostics ────────────────────────────────────────────────────
const SYSTEM_COMPONENTS = [
  { key: "CONTROLLER", nameEn: "Controller", nameAr: "وحدة التحكم", value: "Online", status: "GREEN",
    detailEn: "Firmware v2.3.1 • Uptime 42d", detailAr: "البرنامج الثابت v2.3.1 • وقت التشغيل 42 يوم", sortOrder: 0 },
  { key: "MOISTURE_SENSOR_A", nameEn: "Moisture Sensor A", nameAr: "مستشعر الرطوبة A", value: "72%", status: "GREEN",
    detailEn: "Last reading 2 min ago", detailAr: "آخر قراءة منذ دقيقتين", sortOrder: 1 },
  { key: "MOISTURE_SENSOR_B", nameEn: "Moisture Sensor B", nameAr: "مستشعر الرطوبة B", value: "28%", status: "RED",
    detailEn: "Check sensor connection. Clean probe contacts.", detailAr: "تحقق من توصيل المستشعر. نظّف جهات التلامس.", sortOrder: 2 },
  { key: "LORA_GATEWAY", nameEn: "LoRa Gateway", nameAr: "بوابة LoRa", value: "Connected", status: "GREEN",
    detailEn: "Uptime: 120 mins", detailAr: "وقت التشغيل: 120 دقيقة", sortOrder: 3 },
  { key: "BATTERY", nameEn: "Battery", nameAr: "البطارية", value: "91%", status: "GREEN",
    detailEn: "Solar charging active", detailAr: "الشحن الشمسي نشط", sortOrder: 4 },
  { key: "FLOW_METER", nameEn: "Flow Meter", nameAr: "عداد التدفق", value: "2.4 L/min", status: "ORANGE",
    detailEn: "Flow rate lower than expected. Check for blockage.", detailAr: "معدل التدفق أقل من المتوقع. تحقق من الانسداد.", sortOrder: 5 },
  { key: "MODULE_4G", nameEn: "4G Module", nameAr: "وحدة 4G", value: "Connected", status: "GREEN",
    detailEn: "Operator: Mobilis • Signal 4/5", detailAr: "المشغل: موبيليس • الإشارة 4/5", sortOrder: 6 },
];

/** `time` is a wall-clock offset applied to today, so the log always looks recent. */
const ERROR_LOGS = [
  { time: "14:22:08", component: "MOISTURE_SENSOR_B", zone: "Zone 1", sensorKey: "Z1-S4",
    messageEn: "Reading below threshold", messageAr: "قراءة أقل من الحد",
    actionEn: "Recalibrate sensor", actionAr: "إعادة معايرة المستشعر" },
  { time: "13:05:41", component: "FLOW_METER", zone: "Zone 2", sensorKey: null,
    messageEn: "Low flow warning", messageAr: "تحذير تدفق منخفض",
    actionEn: "Inspect water line", actionAr: "فحص خط المياه" },
  // Farm-wide: no zone, which is what the Location column shows as "—".
  { time: "09:30:12", component: "CONTROLLER", zone: null, sensorKey: null,
    messageEn: "Firmware update available", messageAr: "تحديث البرنامج الثابت متاح",
    actionEn: "Update via Settings", actionAr: "التحديث من الإعدادات" },
];

const ACTIVITY_ROWS = [
  { time: "14:22:08", kind: "VALVE_OPEN", type: "AUTO", zone: "Zone 3", actor: null,
    messageEn: "System opened valve automatically", messageAr: "فتح الصمام تلقائياً" },
  { time: "13:05:41", kind: "VALVE_CLOSE", type: "MANUAL", zone: "Zone 1", actor: "worker",
    messageEn: "Manual override — valve closed", messageAr: "تجاوز يدوي — إغلاق الصمام", geotag: true },
  { time: "12:30:00", kind: "THRESHOLD_REACHED", type: "AUTO", zone: "Zone 3", actor: null,
    messageEn: "Moisture threshold reached", messageAr: "بلغت رطوبة التربة الحد المطلوب" },
  { time: "11:15:22", kind: "VALVE_OPEN", type: "AUTO", zone: "Zone 2", actor: null,
    messageEn: "System opened valve automatically", messageAr: "فتح الصمام تلقائياً" },
  { time: "09:45:10", kind: "SCHEDULED_IRRIGATION", type: "AUTO", zone: "Zone 1", actor: null,
    messageEn: "Scheduled irrigation completed", messageAr: "اكتمل الري المجدول" },
  { time: "08:00:00", kind: "MANUAL_OVERRIDE", type: "MANUAL", zone: "Zone 4", actor: "worker",
    messageEn: "Manual check performed", messageAr: "تم إجراء فحص يدوي", geotag: true },
  { time: "06:30:15", kind: "VALVE_OPEN", type: "AUTO", zone: "Zone 2", actor: null,
    messageEn: "System opened valve automatically", messageAr: "فتح الصمام تلقائياً" },
];

/** The two slots the booking UI marks unavailable, plus lunch. */
const BLOCKED_SLOTS = ["10:00 am", "3:00 pm"];

/** The 7-day root-moisture series the dashboard chart was hardcoded to. */
const WEEK_MOISTURE = [72, 58, 45, 63, 75, 52, 68];

// ── helpers ──────────────────────────────────────────────────────────────────
function atToday(time: string): Date {
  const [h, m, s] = time.split(":").map(Number);
  const date = new Date();
  date.setHours(h ?? 0, m ?? 0, s ?? 0, 0);
  return date;
}

function daysAgo(days: number, hour = 6): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

async function main(): Promise<void> {
  console.log("Seeding Semico…");

  // Idempotent: wipe child tables first so re-running gives a clean, predictable dataset.
  await prisma.auditLog.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.irrigationCommand.deleteMany();
  await prisma.telemetry.deleteMany();
  await prisma.errorLog.deleteMany();
  await prisma.systemComponent.deleteMany();
  await prisma.deviceStatus.deleteMany();
  await prisma.farmSettings.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.experience.deleteMany();
  await prisma.education.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.bookingBlock.deleteMany();
  await prisma.user.deleteMany();
  await prisma.farm.deleteMany();
  await prisma.wilaya.deleteMany();
  await prisma.blogPost.deleteMany();
  await prisma.product.deleteMany();
  await prisma.servicePlan.deleteMany();
  await prisma.pricingPlan.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.stat.deleteMany();
  await prisma.testimonial.deleteMany();

  // ── reference ──────────────────────────────────────────────────────────────
  await prisma.wilaya.createMany({
    data: WILAYAS.map(([code, name]) => ({
      code,
      nameEn: name,
      nameAr: name, // see note above: mirrors EN rather than inventing transliterations
      covered: true,
    })),
  });
  console.log(`  wilayas: ${WILAYAS.length}`);

  // ── content ────────────────────────────────────────────────────────────────
  await prisma.servicePlan.createMany({ data: SERVICE_PLANS });
  await prisma.pricingPlan.createMany({
    data: SERVICE_PLANS.flatMap((plan) => plan.priceValue === null ? [] : [{
      nameEn: plan.titleEn,
      nameAr: plan.titleAr,
      price: plan.priceValue,
      currency: "DZD",
      featuresJson: JSON.stringify([
        { en: plan.descEn, ar: plan.descAr },
        ...(plan.unitEn && plan.unitAr ? [{ en: plan.unitEn, ar: plan.unitAr }] : []),
        ...(plan.badgeEn && plan.badgeAr ? [{ en: plan.badgeEn, ar: plan.badgeAr }] : []),
      ]),
      isActive: true,
    }]),
  });
  await prisma.product.createMany({ data: PRODUCTS });
  await prisma.blogPost.createMany({
    data: BLOG_POSTS.map((post) => ({ ...post, publishedAt: new Date(post.publishedAt), published: true })),
  });
  await prisma.stat.createMany({ data: STATS });
  await prisma.teamMember.createMany({ data: TEAM });
  await prisma.testimonial.createMany({ data: TESTIMONIALS });
  console.log(
    `  content: ${SERVICE_PLANS.length} plans, ${PRODUCTS.length} products, ${BLOG_POSTS.length} posts, ` +
      `${STATS.length} stats, ${TEAM.length} team, ${TESTIMONIALS.length} testimonials`,
  );

  // ── demo farm ──────────────────────────────────────────────────────────────
  const passwordHash = await argon2.hash(DEMO_PASSWORD, {
    type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1,
  });

  const owner = await prisma.user.create({
    data: {
      email: DEMO_OWNER_EMAIL,
      passwordHash,
      fullName: "Ahmed K.",
      role: "OWNER",
      status: "ACTIVE",
      phone: "+213 555 123 456",
      wilayaId: "16",
      commune: "Hydra",
      bio: "Passionate about bridging technology and agriculture to improve water efficiency in Algerian farms.",
      experiences: {
        create: [{
          jobTitle: "Chief Agronomist",
          company: "Ferme Nationale de Mitidja",
          startDate: "Jan 2019",
          endDate: null,
          isPresent: true,
          description: "Overseeing crop rotation and precision irrigation across 800 hectares.",
          sortOrder: 0,
        }],
      },
      educations: {
        create: [{ degree: "M.Sc. Agricultural Engineering", institution: "ENSA Alger", year: "2018", sortOrder: 0 }],
      },
    },
  });

  const farm = await prisma.farm.create({
    data: {
      name: "Ferme de la Mitidja",
      ownerCode: DEMO_OWNER_CODE,
      ownerId: owner.id,
      wilayaId: "09",
      commune: "Blida",
      landAreaHa: 12,
      settings: { create: { moistureThreshold: 40, autoIrrigation: true, pushNotifications: true } },
      deviceStatus: {
        create: {
          firmwareVersion: "v2.3.1",
          controllerOnline: true,
          loraRssi: -68,
          cellularStatus: "CONNECTED",
          cellularOperator: "Mobilis",
          cellularSignal: 4,
          batteryPct: 91,
          loraGatewayOnline: true,
          loraUptimeMinutes: 120,
          flowRateLpm: 2.4,
        },
      },
      components: { create: SYSTEM_COMPONENTS },
      zones: {
        create: [
          { name: "Zone 1", sortOrder: 0, valveState: "CLOSED" },
          { name: "Zone 2", sortOrder: 1, valveState: "OPEN" },
          { name: "Zone 3", sortOrder: 2, valveState: "OPEN" },
          { name: "Zone 4", sortOrder: 3, valveState: "CLOSED" },
        ],
      },
    },
    include: { zones: true },
  });

  // Workers — mirroring the three rows the Settings page hardcodes.
  const workers = await Promise.all([
    prisma.user.create({
      data: { email: "youssef@ferme.dz", passwordHash, fullName: "Youssef M.", role: "WORKER",
        workerType: "OPERATOR", valveControl: true, status: "ACTIVE", farmId: farm.id },
    }),
    prisma.user.create({
      data: { email: "fatima@ferme.dz", passwordHash, fullName: "Fatima B.", role: "WORKER",
        workerType: "ENGINEER", valveControl: false, status: "ACTIVE", farmId: farm.id },
    }),
    prisma.user.create({
      data: { email: "karim@ferme.dz", passwordHash, fullName: "Karim A.", role: "WORKER",
        workerType: "OPERATOR", valveControl: false, status: "INVITED", farmId: farm.id },
    }),
  ]);
  console.log(`  farm "${farm.name}" (owner code ${DEMO_OWNER_CODE}) with ${workers.length} workers`);

  const zoneByName = new Map(farm.zones.map((zone) => [zone.name, zone]));

  // ── sensors: 14 per zone, 56 in all ────────────────────────────────────────
  // Deliberately more than a handful: the System Health view has to scale past 50 sensors, and a
  // seed with four of them would let a layout that only works for four pass review.
  const SENSORS_PER_ZONE = 14;
  const sensorRows = farm.zones.flatMap((zone, zoneIndex) =>
    Array.from({ length: SENSORS_PER_ZONE }, (_, sensorIndex) => {
      // A couple of offline sensors, so the Connection column shows both states rather than an
      // all-green list that proves nothing.
      const offline =
        (zoneIndex === 0 && sensorIndex === 3) || (zoneIndex === 1 && sensorIndex === 9);

      return {
        farmId: farm.id,
        zoneId: zone.id,
        key: `Z${zoneIndex + 1}-S${sensorIndex + 1}`,
        connection: offline ? "OFFLINE" : "ONLINE",
        // Offline sensors last reported hours ago; online ones within the hour.
        lastSeenAt: new Date(Date.now() - (offline ? 6 * 60 + 12 : (sensorIndex + 1) * 3) * 60_000),
        batteryPct: offline ? 8 : 92 - sensorIndex,
        sortOrder: sensorIndex,
      };
    }),
  );
  await prisma.sensor.createMany({ data: sensorRows });
  console.log(`  sensors: ${sensorRows.length}`);

  // ── telemetry: 7 daily points matching the old hardcoded chart, plus 48h of hourly detail ──
  const telemetry: Array<Record<string, unknown>> = [];

  WEEK_MOISTURE.forEach((moisture, index) => {
    const daysBack = WEEK_MOISTURE.length - 1 - index;
    // A gentle surface/root offset keeps the two series visually distinct in the chart.
    telemetry.push({
      farmId: farm.id,
      zoneId: zoneByName.get("Zone 1")?.id ?? null,
      recordedAt: daysAgo(daysBack),
      rootMoisture: moisture,
      surfaceMoisture: Math.max(5, moisture - 8),
      soilTempC: 18 + (index % 4),
      batteryPct: 88 + (index % 6),
      flowRateLpm: 2.4,
      loraRssi: -68,
      valveState: moisture < 50 ? "OPEN" : "CLOSED",
    });
  });

  // Hourly rows for the Analytics drying-rate curve and the heatmap.
  for (let hoursBack = 47; hoursBack >= 0; hoursBack -= 1) {
    const recordedAt = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const hourOfDay = recordedAt.getHours();
    // Drier in the afternoon: a shallow curve, not a random walk, so charts look plausible.
    const root = 80 - Math.round(Math.sin((hourOfDay / 24) * Math.PI) * 22);
    telemetry.push({
      farmId: farm.id,
      zoneId: zoneByName.get("Zone 1")?.id ?? null,
      recordedAt,
      rootMoisture: root,
      surfaceMoisture: Math.max(5, root - 10),
      soilTempC: 16 + Math.round(Math.sin((hourOfDay / 24) * Math.PI) * 10),
      batteryPct: 85 + (hourOfDay % 10),
      flowRateLpm: root < 50 ? 3.1 : 0,
      loraRssi: -66 - (hourOfDay % 5),
      valveState: root < 50 ? "OPEN" : "CLOSED",
    });
  }

  await prisma.telemetry.createMany({ data: telemetry as never });
  console.log(`  telemetry: ${telemetry.length} readings`);

  // ── error log ──────────────────────────────────────────────────────────────
  await prisma.errorLog.createMany({
    data: ERROR_LOGS.map((row) => ({
      farmId: farm.id,
      occurredAt: atToday(row.time),
      component: row.component,
      messageEn: row.messageEn,
      messageAr: row.messageAr,
      actionEn: row.actionEn,
      actionAr: row.actionAr,
      zoneId: row.zone ? (zoneByName.get(row.zone)?.id ?? null) : null,
      sensorKey: row.sensorKey,
    })),
  });

  // ── activity feed (also written to the audit trail, as the live code does) ──
  const operator = workers[0];
  for (const row of ACTIVITY_ROWS) {
    const zone = zoneByName.get(row.zone);
    const occurredAt = atToday(row.time);
    const actorId = row.actor === "worker" ? (operator?.id ?? null) : null;

    await prisma.activityLog.create({
      data: {
        farmId: farm.id,
        occurredAt,
        kind: row.kind,
        type: row.type,
        zoneId: zone?.id ?? null,
        actorId,
        messageEn: row.messageEn,
        messageAr: row.messageAr,
        lat: row.geotag ? 36.7538 : null,
        lng: row.geotag ? 3.0588 : null,
      },
    });

    if (actorId) {
      await prisma.auditLog.create({
        data: {
          actorId,
          farmId: farm.id,
          action: row.kind,
          entityType: "ZONE",
          entityId: zone?.id ?? "unknown",
          metadata: JSON.stringify({ seeded: true, type: row.type }),
          createdAt: occurredAt,
        },
      });
    }
  }
  console.log(`  activity: ${ACTIVITY_ROWS.length} feed rows (+audit rows for manual actions)`);

  // ── bookings ───────────────────────────────────────────────────────────────
  // Block the two slots the design marks unavailable, for the next 60 days.
  const blocks: Array<{ day: Date; startTime: string; reason: string }> = [];
  for (let offset = 0; offset < 60; offset += 1) {
    const day = new Date();
    day.setDate(day.getDate() + offset);
    day.setHours(0, 0, 0, 0);
    for (const startTime of BLOCKED_SLOTS) {
      blocks.push({ day, startTime, reason: startTime === "3:00 pm" ? "Team meeting" : "Unavailable" });
    }
  }
  await prisma.bookingBlock.createMany({ data: blocks });

  const sampleDay = new Date();
  sampleDay.setDate(sampleDay.getDate() + 2);
  sampleDay.setHours(0, 0, 0, 0);
  await prisma.booking.create({
    data: {
      name: "Karim B.", email: "karim.b@example.dz", phone: "+213 661 000 111",
      day: sampleDay, startTime: "9:30 am", status: "CONFIRMED",
      // A live booking has to claim its slot, or availability would offer it again.
      slotKey: `${sampleDay.toISOString().slice(0, 10)}|9:30 am`,
      notes: "Interested in the Farm plan for 12 hectares of olives.",
    },
  });
  console.log(`  bookings: ${blocks.length} blocked slots + 1 confirmed`);

  console.log("\nSeed complete.\n");
  console.log("  Demo sign-in:");
  console.log(`    owner   ${DEMO_OWNER_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`    worker  youssef@ferme.dz / ${DEMO_PASSWORD}  (operator, valve control granted)`);
  console.log(`    worker  fatima@ferme.dz / ${DEMO_PASSWORD}  (engineer, read-only)`);
  console.log(`  Farm owner code: ${DEMO_OWNER_CODE}\n`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
