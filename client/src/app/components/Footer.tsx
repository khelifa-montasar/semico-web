import { SemicoLogo } from "./SemicoLogo";
import { useLanguage } from "../contexts/LanguageContext";

export function Footer() {
  const { t, font } = useLanguage();

  const socials = [
    { label: "Facebook", href: "https://facebook.com" },
    { label: "Instagram", href: "https://instagram.com" },
    { label: "X", href: "https://x.com" },
    { label: "LinkedIn", href: "https://linkedin.com" },
    { label: "GitHub", href: "https://github.com" },
  ];

  return (
    <footer className="py-12 flex flex-col items-center gap-4" style={{ fontFamily: font }}>
      <SemicoLogo height={24} />
      <p
        className="text-[13px] text-[#9CA3AF] tracking-wide text-center"
        style={{ fontFamily: font, fontWeight: 400 }}
      >
        {t.footer.tagline}
      </p>
      <div className="flex gap-6 mt-1 flex-wrap justify-center">
        {socials.map((s) => (
          <a
            key={s.label}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-[#9CA3AF] hover:text-[#4A4A4A] cursor-pointer transition-colors"
            style={{ fontFamily: "Inter" }}
          >
            {s.label}
          </a>
        ))}
      </div>
    </footer>
  );
}