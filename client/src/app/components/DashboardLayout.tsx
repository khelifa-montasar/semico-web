import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { SemicoLogo } from "./SemicoLogo";
import {
  LayoutDashboard,
  Activity,
  HeartPulse,
  BarChart3,
  Settings,
  Sprout,
  LogOut,
  MessageCircle,
  Droplets,
} from "lucide-react";
import { Suspense, useState } from "react";
import { useLanguage } from "../contexts/LanguageContext";
import { useTokens } from "../hooks/useTokens";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { RouteFallback } from "./RouteFallback";
import { useAuth } from "@/features/auth/AuthContext";
import { canAccessDiagnostics } from "@/features/auth/permissions";
import { useRealtime } from "@/features/realtime/useRealtime";

export function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const realtimeState = useRealtime();
  const [chatOpen, setChatOpen] = useState(false);
  const { t, isRTL, font } = useLanguage();

  // Shared palette — see theme/tokens.ts. Every key and value here is identical to the inline
  // object this replaced, so the rendering is unchanged; the app chrome now has one definition.
  const c = useTokens();

  const sidebarLinks = [
    { to: "/dashboard", icon: LayoutDashboard, label: t.sidebar.dashboard },
    { to: "/dashboard/system-health", icon: HeartPulse, label: t.sidebar.systemHealth },
    { to: "/dashboard/activity", icon: Activity, label: t.sidebar.activity },
    { to: "/dashboard/analytics", icon: BarChart3, label: t.sidebar.analytics },
    // Owner and engineer only. Hiding the link is convenience, not access control — the route
    // itself is wrapped in `RequireDiagnosticsRoute`, so an operator who types the URL is
    // redirected either way.
    ...(canAccessDiagnostics(user)
      ? [{ to: "/dashboard/diagnostics", icon: Sprout, label: t.sidebar.demoPlot }]
      : []),
    { to: "/dashboard/settings", icon: Settings, label: t.sidebar.settings },
  ];

  const currentTitle =
    sidebarLinks.find((l) => l.to === location.pathname)?.label || t.sidebar.dashboard;

  const supportPos = isRTL
    ? "bottom-20 md:bottom-6 left-6"
    : "bottom-20 md:bottom-6 right-6";
  const chatPos = isRTL
    ? "bottom-36 md:bottom-22 left-6"
    : "bottom-36 md:bottom-22 right-6";

  return (
    <div
      className="min-h-screen flex"
      style={{ fontFamily: font, background: c.layoutBg }}
      dir={isRTL ? "rtl" : "ltr"}
    >
      {/* ── Desktop Sidebar ────────────────────────────────────────────── */}
      <aside
        className="hidden md:flex flex-col w-[240px] shrink-0 h-screen sticky top-0 overflow-y-auto z-40"
        style={{
          background: c.sidebarBg,
          borderInlineEnd: `1px solid ${c.border}`,
        }}
      >
        <div
          className="h-[72px] flex items-center px-6"
          style={{ borderBottom: `1px solid ${c.border}` }}
        >
          <Link to="/" className="flex items-center gap-2">
            <SemicoLogo height={30} />
          </Link>
        </div>

        <nav className="flex-1 py-4 px-3 flex flex-col gap-1">
          {sidebarLinks.map((l) => {
            const active = location.pathname === l.to;
            return (
              <Link
                key={l.to}
                to={l.to}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] transition-colors"
                style={{
                  background: active ? c.activeBg : "transparent",
                  color: active ? c.activeText : c.textSec,
                }}
                onMouseEnter={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = c.hoverBg;
                }}
                onMouseLeave={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                <l.icon size={18} strokeWidth={1.5} />
                <span>{l.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="px-3 pb-4 flex flex-col gap-2">
          <div className="px-3 py-2">
            <LanguageSwitcher />
          </div>
          <button
            type="button"
            onClick={() => {
              // Revokes the refresh token server-side and clears local state, then leaves.
              void logout().finally(() => navigate("/", { replace: true }));
            }}
            className="flex items-center gap-3 px-3 py-2.5 text-[14px] transition-colors w-full text-start"
            style={{ color: c.textSec }}
          >
            <LogOut size={18} strokeWidth={1.5} />
            <span>{t.sidebar.logOut}</span>
          </button>
        </div>
      </aside>

      {/* ── Mobile bottom nav ──────────────────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 md:hidden flex justify-around py-2 z-50"
        style={{
          background: c.sidebarBg,
          borderTop: `1px solid ${c.border}`,
        }}
      >
        {sidebarLinks.map((l) => {
          const active = location.pathname === l.to;
          return (
            <Link
              key={l.to}
              to={l.to}
              className="p-2"
              style={{ color: active ? "#00A859" : c.textSec }}
            >
              <l.icon size={20} strokeWidth={1.5} />
            </Link>
          );
        })}
      </div>

      {/* ── Main content ───────────────────────────────────────────────── */}
      <div className="relative z-0 flex-1 min-w-0 overflow-x-clip" style={{ background: c.contentBg }}>
        <header
          className="h-[72px] flex items-center px-6 md:px-8 sticky top-0 z-30"
          style={{
            background: c.headerBg,
            borderBottom: `1px solid ${c.border}`,
          }}
        >
          <h2
            className="text-[16px]"
            style={{ fontWeight: 500, color: c.text }}
          >
            {currentTitle}
          </h2>
          <div className="ms-auto flex items-center gap-4">
            <span
              className="inline-flex items-center gap-2 text-[12px]"
              style={{ color: realtimeState === "connected" ? c.green : c.textSec }}
              aria-live="polite"
              aria-label={`Live updates ${realtimeState}`}
              title={`Live updates ${realtimeState}`}
            >
              <span aria-hidden="true">●</span>
              {realtimeState === "connected" ? "Live" : realtimeState === "disconnected" ? "Offline" : "Connecting"}
            </span>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px]"
              style={{ background: c.avatarBg, fontWeight: 500, fontFamily: "JetBrains Mono" }}
              title={user?.fullName ?? undefined}
            >
              {user?.initials ?? "—"}
            </div>
          </div>
        </header>

        <div className="p-4 md:p-8 pb-20 md:pb-8">
          {/* Per-layout boundary so navigating between dashboard tabs keeps the sidebar mounted. */}
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </div>

      {/* ── Support Widget ──────────────────────────────────────────────── */}
      <button
        onClick={() => setChatOpen(!chatOpen)}
        className={`fixed ${supportPos} w-12 h-12 rounded-full flex items-center justify-center shadow-lg z-50 hover:scale-105 transition-transform`}
        style={{ background: c.green }}
      >
        {chatOpen ? (
          <MessageCircle size={20} strokeWidth={1.5} className="text-white" />
        ) : (
          <Droplets size={20} strokeWidth={1.5} className="text-white" />
        )}
      </button>

      {chatOpen && (
        <div
          className={`fixed ${chatPos} w-[320px] rounded-lg shadow-lg z-50 overflow-hidden`}
          style={{
            background: c.chatBg,
            border: `1px solid ${c.chatBorder}`,
          }}
        >
          <div
            className="p-4"
            style={{ borderBottom: `1px solid ${c.chatBorder}` }}
          >
            <p
              className="text-[14px]"
              style={{ fontWeight: 500, color: c.text }}
            >
              {t.support.title}
            </p>
            <p className="text-[12px] mt-0.5" style={{ color: c.textSec }}>
              {t.support.subtitle}
            </p>
          </div>
          <div className="p-4 h-[200px] flex items-center justify-center">
            <p className="text-[13px]" style={{ color: c.textSec }}>
              {t.support.messagePlaceholder}
            </p>
          </div>
          <div
            className="p-3"
            style={{ borderTop: `1px solid ${c.chatBorder}` }}
          >
            <input
              placeholder={t.support.inputPlaceholder}
              className="w-full px-3 py-2 text-[13px] outline-none bg-transparent"
              style={{
                fontFamily: font,
                textAlign: isRTL ? "right" : "left",
                borderBottom: `1px solid ${c.chatBorder}`,
                color: c.text,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}