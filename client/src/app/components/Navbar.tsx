import { Link, useLocation } from "react-router";
import { SemicoLogo } from "./SemicoLogo";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function Navbar() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const { t, font } = useLanguage();

  const links = [
    { to: "/", label: t.nav.home },
    { to: "/services", label: t.nav.services },
    { to: "/products", label: t.nav.products },
    { to: "/blog", label: t.nav.blog },
    { to: "/about", label: t.nav.about },
  ];

  return (
    <nav
      className="h-[72px] flex items-center px-6 md:px-12 border-b border-[#EAECF0] bg-white/80 backdrop-blur-sm sticky top-0 z-50"
      style={{ fontFamily: font }}
    >
      <Link to="/" className="flex items-center gap-2 shrink-0">
        <SemicoLogo height={36} />
      </Link>

      {/* Desktop nav links — centered */}
      <div className="hidden md:flex items-center gap-8 mx-auto">
        {links.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className={`text-[14px] tracking-wide transition-colors ${
              location.pathname === l.to ? "text-[#1A1A1A]" : "text-[#6B7280] hover:text-[#1A1A1A]"
            }`}
            style={{ fontFamily: font, fontWeight: 400 }}
          >
            {l.label}
          </Link>
        ))}
      </div>

      {/* Desktop: Language Switcher + Log in */}
      <div className="ms-auto hidden md:flex items-center gap-4">
        <LanguageSwitcher />
        <Link
          to="/login"
          className="text-[14px] text-[#6B7280] hover:text-[#1A1A1A] transition-colors"
          style={{ fontFamily: font, fontWeight: 400 }}
        >
          {t.nav.logIn}
        </Link>
      </div>

      {/* Mobile hamburger */}
      <button className="ms-auto md:hidden text-[#4A4A4A]" onClick={() => setOpen(!open)}>
        {open ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
      </button>

      {/* Mobile menu */}
      {open && (
        <div
          className="absolute top-[72px] start-0 end-0 bg-white border-b border-[#EAECF0] p-6 flex flex-col gap-4 md:hidden z-50"
          style={{ left: 0, right: 0 }}
        >
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setOpen(false)}
              className="text-[14px] text-[#4A4A4A]"
              style={{ fontFamily: font }}
            >
              {l.label}
            </Link>
          ))}
          <Link
            to="/login"
            onClick={() => setOpen(false)}
            className="text-[14px] text-[#6B7280]"
            style={{ fontFamily: font }}
          >
            {t.nav.logIn}
          </Link>
          <div className="pt-2">
            <LanguageSwitcher />
          </div>
        </div>
      )}
    </nav>
  );
}