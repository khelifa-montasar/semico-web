import { createContext, useContext, useState, ReactNode } from "react";
import { translations, Language, TranslationSet } from "../i18n/translations";

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: TranslationSet;
  isRTL: boolean;
  font: string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "en",
  setLang: () => {},
  t: translations.en,
  isRTL: false,
  font: "Inter, sans-serif",
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    try {
      return (localStorage.getItem("semico-lang") as Language) || "en";
    } catch {
      return "en";
    }
  });

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    try {
      localStorage.setItem("semico-lang", newLang);
    } catch {}
  };

  const isRTL = lang === "ar";
  const font = isRTL ? "'Noto Sans Arabic', sans-serif" : "Inter, sans-serif";
  const t = translations[lang] as unknown as TranslationSet;

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, isRTL, font }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
