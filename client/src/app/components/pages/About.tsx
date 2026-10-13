import { MapPin, Linkedin } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTheme } from "../../contexts/ThemeContext";
import { useTokens } from "../../hooks/useTokens";
import { useLocalized } from "../../hooks/useLocalized";
import { ConsultationBooking } from "../ConsultationBooking";
import { useContentBundle } from "../../../features/content/useContent";

/**
 * About's palette.
 *
 * This page keeps a handful of overrides rather than using the shared tokens outright, because it
 * genuinely differs: its secondary text is a darker grey (#4A4A4A light) for long-form body copy,
 * where the app-wide `sec` is the lighter muted tone used for labels. Mapping it onto the shared
 * value would visibly wash the page out.
 *
 * The shared keys it agreed on (border, text, green, blue, card, divider) are spread in rather than
 * repeated, so only the real differences are declared here.
 */
function useAboutPalette(isDark: boolean) {
  const shared = useTokens();
  return {
    ...shared,
    pageBg: isDark ? "#0D1117" : "#FFFFFF",
    sec: isDark ? "#C9D1D9" : "#4A4A4A",
    muted: isDark ? "#8B949E" : "#9CA3AF",
    avatarBg: isDark ? "#21262D" : "#F3F4F6",
    mapBg: isDark ? "#161B22" : "#FAFAFA",
  };
}

type AboutPalette = ReturnType<typeof useAboutPalette>;

// ─── Avatar ───────────────────────────────────────────────────────────────────

function TeamAvatar({
  initials,
  isDark,
  palette,
}: {
  initials: string;
  isDark: boolean;
  palette: AboutPalette;
}) {
  return (
    <div className="relative" style={{ width: 120, height: 120 }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{ border: `1px solid ${palette.border}`, borderRadius: "50%" }}
      />
      <div
        className="absolute inset-[1px] rounded-full flex items-center justify-center"
        style={{ background: palette.avatarBg }}
      >
        <span
          style={{
            fontFamily: "JetBrains Mono",
            fontSize: 22,
            fontWeight: 400,
            color: palette.muted,
            letterSpacing: "0.04em",
          }}
        >
          {initials}
        </span>
      </div>
      <div
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          boxShadow: isDark
            ? "inset 0 0 0 1px rgba(255,255,255,0.04)"
            : "inset 0 0 0 1px rgba(0,0,0,0.04)",
          borderRadius: "50%",
        }}
      />
    </div>
  );
}

// ─── Team card ────────────────────────────────────────────────────────────────

function TeamCard({
  member,
  isDark,
  palette,
  font,
  isRTL,
}: {
  /** Text is already resolved to the active language by the caller. */
  member: { initials: string; name: string; role: string; bio: string; linkedin: string | null };
  isDark: boolean;
  palette: AboutPalette;
  font: string;
  isRTL: boolean;
}) {
  return (
    <div
      className="flex flex-col items-center text-center rounded-2xl p-8 transition-colors"
      style={{
        border: `1px solid ${palette.border}`,
        background: palette.card,
        maxWidth: 360,
        width: "100%",
      }}
    >
      <TeamAvatar initials={member.initials} isDark={isDark} palette={palette} />

      <p
        className="mt-6"
        style={{ fontFamily: font, fontSize: 20, fontWeight: 500, color: palette.text, lineHeight: 1.3 }}
      >
        {member.name}
      </p>

      <span
        className="mt-2 px-3 py-1 rounded-full"
        style={{
          fontFamily: "JetBrains Mono",
          fontSize: 11,
          textTransform: "uppercase" as const,
          letterSpacing: "0.08em",
          color: palette.green,
          background: isDark ? "rgba(63,185,80,0.10)" : "rgba(0,168,89,0.08)",
          border: `1px solid ${isDark ? "rgba(63,185,80,0.25)" : "rgba(0,168,89,0.20)"}`,
        }}
      >
        {member.role}
      </span>

      <p
        className="mt-5"
        style={{
          fontFamily: font,
          fontSize: 14,
          color: palette.sec,
          lineHeight: 1.7,
          maxWidth: 280,
          textAlign: isRTL ? "right" : "center",
        }}
      >
        {member.bio}
      </p>

      <div className="mt-6 w-10" style={{ height: 1, background: palette.divider }} />

      {/* Only rendered when there is a profile to link to — a dead "LinkedIn" link is worse than
          no link. */}
      {member.linkedin && (
        <a
          href={member.linkedin}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center gap-2 transition-colors group"
          style={{ color: palette.muted, textDecoration: "none", fontFamily: font, fontSize: 13 }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = palette.blue;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = palette.muted;
          }}
        >
          <Linkedin size={16} strokeWidth={1.5} style={{ transition: "color 0.15s" }} />
          <span>LinkedIn</span>
        </a>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function About() {
  const { t, isRTL, font } = useLanguage();
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === "dark";
  const a = t.about;
  const c = useAboutPalette(isDark);
  const L = useLocalized();

  const content = useContentBundle();
  const stats = content.data?.stats ?? [];
  const team = (content.data?.team ?? []).map((member) => ({
    initials: member.initials,
    name: member.name,
    role: L(member.role),
    bio: L(member.bio),
    linkedin: member.linkedinUrl,
  }));

  return (
    <div
      className="min-h-screen transition-colors"
      style={{ background: c.pageBg, fontFamily: font }}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div className="max-w-[960px] mx-auto px-6 py-16">
        {/* ── Page title ───────────────────────────────────────────────── */}
        <h1
          className="text-[24px] text-center mb-12"
          style={{ fontFamily: font, fontWeight: 500, color: c.text }}
        >
          {a.title}
        </h1>

        {/* ── Mission / Vision ─────────────────────────────────────────── */}
        <div className="grid md:grid-cols-2 gap-0 mb-16">
          <div className={`pb-8 md:pb-0 ${isRTL ? "md:ps-8" : "md:pe-8"}`}>
            <h3
              className="mb-3 tracking-wider"
              style={{
                fontFamily: "JetBrains Mono",
                textTransform: "uppercase",
                fontSize: 11,
                color: c.muted,
              }}
            >
              {a.missionLabel}
            </h3>
            <p className="text-[15px]" style={{ fontFamily: font, lineHeight: 1.7, color: c.sec }}>
              {a.missionText}
            </p>
          </div>
          <div
            className={`${isRTL ? "md:pe-8 md:border-e" : "md:ps-8 md:border-s"} border-t md:border-t-0 pt-8 md:pt-0`}
            style={{ borderColor: c.divider }}
          >
            <h3
              className="mb-3 tracking-wider"
              style={{
                fontFamily: "JetBrains Mono",
                textTransform: "uppercase",
                fontSize: 11,
                color: c.muted,
              }}
            >
              {a.visionLabel}
            </h3>
            <p className="text-[15px]" style={{ fontFamily: font, lineHeight: 1.7, color: c.sec }}>
              {a.visionText}
            </p>
          </div>
        </div>

        {/* ── Stats ────────────────────────────────────────────────────── */}
        <div
          className="rounded-xl mb-16 grid grid-cols-2 md:grid-cols-4"
          style={{ border: `1px solid ${c.border}`, background: c.card }}
        >
          {stats.map((stat, idx) => (
            <div
              key={stat.id}
              className={`flex flex-col items-center py-8 px-4 ${
                idx < stats.length - 1 ? (isRTL ? "border-s" : "border-e") : ""
              }`}
              style={{ borderColor: c.border }}
            >
              <p
                style={{
                  fontFamily: "JetBrains Mono",
                  fontSize: 28,
                  fontWeight: 400,
                  color: c.text,
                  lineHeight: 1,
                }}
              >
                {L(stat.value)}
              </p>
              <p className="mt-2 text-[12px]" style={{ fontFamily: font, color: c.muted }}>
                {L(stat.label)}
              </p>
            </div>
          ))}
        </div>

        {/* ── Team section ─────────────────────────────────────────────── */}
        <div className="mb-16">
          <div className="flex flex-col items-center mb-12">
            <span
              className="mb-3 tracking-widest"
              style={{
                fontFamily: "JetBrains Mono",
                fontSize: 11,
                textTransform: "uppercase",
                color: c.green,
                letterSpacing: "0.12em",
              }}
            >
              {isRTL ? "الفريق" : "The Team"}
            </span>
            <h2
              style={{
                fontFamily: font,
                fontSize: 24,
                fontWeight: 500,
                color: c.text,
                lineHeight: 1.2,
              }}
            >
              {a.meetTheTeam}
            </h2>
            <div className="mt-4" style={{ width: 32, height: 2, borderRadius: 2, background: c.green }} />
          </div>

          {content.isError && (
            <p className="text-[13px] text-center" style={{ color: c.crit }}>
              {content.error instanceof Error ? content.error.message : "Could not load the team."}
            </p>
          )}

          <div className="flex flex-col md:flex-row justify-center items-stretch gap-8">
            {team.map((member) => (
              <TeamCard
                key={member.initials}
                member={member}
                isDark={isDark}
                palette={c}
                font={font}
                isRTL={isRTL}
              />
            ))}
          </div>
        </div>

        {/* ── Map placeholder ───────────────────────────────────────────── */}
        <div
          className="rounded-lg h-[200px] flex items-center justify-center mb-16"
          style={{ border: `1px solid ${c.border}`, background: c.mapBg }}
        >
          <div className="flex items-center gap-2" style={{ color: c.muted }}>
            <MapPin size={18} strokeWidth={1.5} />
            <span className="text-[13px]" style={{ fontFamily: font }}>
              {a.location}
            </span>
          </div>
        </div>

        {/* ── Guarantee ────────────────────────────────────────────────── */}
        <div className="text-center py-8 mb-8">
          <p
            className="text-[18px] max-w-[680px] mx-auto"
            style={{ fontFamily: font, fontWeight: 400, lineHeight: 1.6, color: c.sec }}
          >
            {t.booking.guarantee}
          </p>
        </div>

        {/* ── Consultation Booking ─────────────────────────────────────── */}
        <div className="mb-8">
          <h2
            className="text-[24px] text-center mb-8"
            style={{ fontFamily: font, fontWeight: 400, color: c.text }}
          >
            {a.bookConsultation}
          </h2>
          <ConsultationBooking />
        </div>
      </div>
    </div>
  );
}
