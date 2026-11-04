import { Suspense } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Coins, FileText, Globe, LayoutDashboard, LogOut, ShieldCheck, Sprout, Users } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { queryKeys } from "@/api/queryKeys";
import { useLanguage } from "../contexts/LanguageContext";
import { useTokens } from "../hooks/useTokens";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { RouteFallback } from "./RouteFallback";
import { SemicoLogo } from "./SemicoLogo";

/** Platform chrome has its own navigation and never subscribes to a farm or its realtime feed. */
export function AdminLayout() {
  const { user, logout } = useAuth();
  const { t, font, isRTL } = useLanguage();
  const c = useTokens();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  function signOut() {
    void logout().catch(() => undefined).finally(() => {
      queryClient.removeQueries({ queryKey: queryKeys.admin.all });
      navigate("/login", { replace: true });
    });
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row" dir={isRTL ? "rtl" : "ltr"}
      style={{ fontFamily: font, background: c.layoutBg, color: c.text }}>
      <a href="#admin-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-3"
        style={{ background: c.card, color: c.text }}>{t.admin.skipNavigation}</a>
      <aside className="flex flex-col md:w-[240px] md:h-screen md:sticky md:top-0 shrink-0"
        style={{ background: c.sidebarBg, borderInlineEnd: `1px solid ${c.border}` }}>
        <Link to="/admin/dashboard" className="px-6 py-5 flex flex-col items-start gap-3"
          style={{ borderBottom: `1px solid ${c.border}` }}>
          <SemicoLogo height={30} />
          <span className="inline-flex items-center gap-2 text-xs font-medium" style={{ color: c.blue }}>
            <ShieldCheck size={16} aria-hidden="true" />{t.admin.portal}
          </span>
        </Link>
        <nav className="flex-1 p-3" aria-label={t.admin.navigation}>
          {[
            { to: "/admin/dashboard", label: t.admin.dashboard, Icon: LayoutDashboard },
            { to: "/admin/pricing", label: t.admin.pricing, Icon: Coins },
            { to: "/admin/blog", label: t.admin.blog, Icon: FileText },
            { to: "/admin/farms", label: t.admin.farms, Icon: Sprout },
            { to: "/admin/users", label: t.admin.users, Icon: Users },
          ].map(({ to, label, Icon }) => <NavLink key={to} to={to} className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm"
            style={({ isActive }) => ({ background: isActive ? c.activeBg : "transparent", color: isActive ? c.activeText : c.textSec })}>
            <Icon size={18} aria-hidden="true" />{label}
          </NavLink>)}
        </nav>
        <div className="px-6 py-4 flex flex-wrap md:flex-col items-start gap-4 text-sm" style={{ color: c.textSec }}>
          <Link to="/" className="inline-flex items-center gap-2"><Globe size={16} aria-hidden="true" />{t.admin.publicSite}</Link>
          <button type="button" onClick={signOut} className="inline-flex items-center gap-2">
            <LogOut size={16} aria-hidden="true" />{t.sidebar.logOut}
          </button>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 md:px-8 py-4"
          style={{ background: c.headerBg, borderBottom: `1px solid ${c.border}` }}>
          <p className="text-sm font-medium">{t.admin.platform}</p>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <span className="flex items-center gap-2 text-sm">
              <span className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium"
                style={{ background: c.avatarBg, color: c.green }} aria-hidden="true">{user?.initials}</span>
              <bdi>{user?.fullName}</bdi>
            </span>
          </div>
        </header>
        <main id="admin-content" tabIndex={-1} className="p-5 md:p-8 max-w-[1440px] mx-auto">
          <Suspense fallback={<RouteFallback />}><Outlet /></Suspense>
        </main>
      </div>
    </div>
  );
}
