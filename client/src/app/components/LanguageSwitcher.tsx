import { useLanguage } from "../contexts/LanguageContext";

/**
 * EN / العربية pill toggle.
 *
 * Lives directly under components/ rather than in the old `ui/` folder: that directory held 46
 * shadcn/Radix primitives that nothing imported, and this was the only file in it with a real
 * caller. It needs nothing but LanguageContext.
 */
export function LanguageSwitcher() {
  const { lang, setLang } = useLanguage();

  return (
    <div
      className="inline-flex items-center border border-[#EAECF0] overflow-hidden shrink-0"
      style={{ borderRadius: 40 }}
      dir="ltr"
    >
      <button
        onClick={() => setLang("en")}
        className="px-3 py-1 text-[12px] transition-colors"
        style={{
          fontFamily: "Inter, sans-serif",
          fontWeight: lang === "en" ? 500 : 400,
          color: lang === "en" ? "#1A1A1A" : "#9CA3AF",
          backgroundColor: lang === "en" ? "rgba(0, 168, 89, 0.08)" : "transparent",
          borderRight: "1px solid #EAECF0",
          outline: "none",
          lineHeight: 1.8,
        }}
      >
        EN
      </button>
      <button
        onClick={() => setLang("ar")}
        className="px-3 py-1 text-[12px] transition-colors"
        style={{
          fontFamily: "'Noto Sans Arabic', sans-serif",
          fontWeight: lang === "ar" ? 500 : 400,
          color: lang === "ar" ? "#1A1A1A" : "#9CA3AF",
          backgroundColor: lang === "ar" ? "rgba(0, 168, 89, 0.08)" : "transparent",
          outline: "none",
          lineHeight: 1.8,
        }}
      >
        العربية
      </button>
    </div>
  );
}
