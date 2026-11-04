import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { SemicoLogo } from "../SemicoLogo";
import { useLanguage } from "../../contexts/LanguageContext";
import { useAuth } from "@/features/auth/AuthContext";
import { ApiError } from "@/lib/api/http";
import type { AuthUser } from "@semico/shared";
import { getPostLoginDestination } from "@/features/auth/navigation";

type Tab = "signin" | "signup";
type Role = "owner" | "worker";

/** Server field errors are keyed by path; this is the shape the form knows how to render. */
type FieldErrors = Record<string, string>;

export function Login() {
  const [tab, setTab] = useState<Tab>("signin");
  const [role, setRole] = useState<Role>("owner");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ownerCode, setOwnerCode] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const navigate = useNavigate();
  const location = useLocation();
  const { login, register } = useAuth();
  const { t, isRTL, font } = useLanguage();
  const l = t.login;

  /** Where the guard bounced them from, so sign-in returns them there. */
  const redirectFrom = (location.state as { from?: string } | null)?.from;

  function switchTab(next: Tab) {
    setTab(next);
    setFormError(null);
    setFieldErrors({});
  }

  function switchRole(next: Role) {
    setRole(next);
    setOwnerCode("");
    setFieldErrors({});
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      let authenticatedUser: AuthUser;
      if (tab === "signin") {
        authenticatedUser = await login({ email: email.trim(), password });
      } else if (role === "owner") {
        authenticatedUser = await register({
          fullName: fullName.trim(),
          email: email.trim(),
          password,
          role: "OWNER",
        });
      } else {
        authenticatedUser = await register({
          fullName: fullName.trim(),
          email: email.trim(),
          password,
          role: "WORKER",
          ownerCode: ownerCode.trim().toUpperCase(),
        });
      }

      navigate(getPostLoginDestination(authenticatedUser.role, redirectFrom), { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        // Field-level problems (a bad owner code, a duplicate email) belong next to the input.
        if (error.details && Object.keys(error.details).length > 0) {
          setFieldErrors(
            Object.fromEntries(
              Object.entries(error.details).map(([field, messages]) => [
                field,
                messages[0] ?? "Invalid value",
              ]),
            ),
          );
        } else {
          setFormError(error.message);
        }
      } else {
        setFormError("Could not reach the server. Please check your connection and try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full h-[48px] border-b outline-none text-[15px] bg-transparent disabled:opacity-50";
  const labelClass = "text-[12px] text-[#9CA3AF] mb-2 block";

  return (
    <div className="flex items-center justify-center py-16 px-4" style={{ fontFamily: font }}>
      <div className="w-full max-w-[440px]">
        <div className="flex justify-center mb-8">
          <SemicoLogo height={32} />
        </div>

        {/* Tabs */}
        <div className="flex gap-6 justify-center mb-8">
          {(["signin", "signup"] as const).map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => switchTab(tabKey)}
              className={`text-[14px] pb-2 transition-colors ${
                tab === tabKey ? "text-[#1A1A1A] border-b border-[#1A1A1A]" : "text-[#9CA3AF]"
              }`}
              style={{ fontFamily: font, fontWeight: 400 }}
            >
              {tabKey === "signin" ? l.signIn : l.signUp}
            </button>
          ))}
        </div>

        <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
          {tab === "signup" && (
            <div>
              <label className={labelClass} style={{ fontFamily: font }} htmlFor="fullName">
                {l.fullName}
              </label>
              <input
                id="fullName"
                name="fullName"
                autoComplete="name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                disabled={submitting}
                className={inputClass}
                style={{
                  fontFamily: font,
                  textAlign: isRTL ? "right" : "left",
                  borderColor: fieldErrors.fullName ? "#FF6B35" : "#EAECF0",
                }}
              />
              {fieldErrors.fullName && (
                <p className="text-[12px] mt-1 text-[#FF6B35]">{fieldErrors.fullName}</p>
              )}
            </div>
          )}

          <div>
            <label className={labelClass} style={{ fontFamily: font }} htmlFor="email">
              {l.email}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              dir="ltr"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting}
              className={inputClass}
              style={{ borderColor: fieldErrors.email ? "#FF6B35" : "#EAECF0" }}
            />
            {fieldErrors.email && <p className="text-[12px] mt-1 text-[#FF6B35]">{fieldErrors.email}</p>}
          </div>

          <div>
            <label className={labelClass} style={{ fontFamily: font }} htmlFor="password">
              {l.password}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              dir="ltr"
              autoComplete={tab === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              className={inputClass}
              style={{ borderColor: fieldErrors.password ? "#FF6B35" : "#EAECF0" }}
            />
            {fieldErrors.password && (
              <p className="text-[12px] mt-1 text-[#FF6B35]">{fieldErrors.password}</p>
            )}
            {tab === "signup" && !fieldErrors.password && (
              <p className="text-[11px] mt-1 text-[#9CA3AF]">At least 8 characters.</p>
            )}
          </div>

          {tab === "signup" && (
            <>
              <div>
                <span className={labelClass} style={{ fontFamily: font }}>
                  {l.role}
                </span>
                <div className="flex gap-3">
                  {(["owner", "worker"] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => switchRole(r)}
                      disabled={submitting}
                      className={`px-4 py-2 rounded-full text-[13px] border transition-colors ${
                        role === r
                          ? "border-[#00A859] text-[#00A859]"
                          : "border-[#EAECF0] text-[#9CA3AF]"
                      }`}
                      style={{ fontFamily: font }}
                    >
                      {r === "owner" ? l.farmOwner : l.worker}
                    </button>
                  ))}
                </div>
              </div>

              {role === "owner" && (
                <p className="text-[12px] text-[#9CA3AF] -mt-2">
                  You&apos;ll get a farm and a shareable code so workers can join.
                </p>
              )}

              {role === "worker" && (
                <div>
                  <label className={labelClass} style={{ fontFamily: font }} htmlFor="ownerCode">
                    {l.farmOwnerCode}
                  </label>
                  <input
                    id="ownerCode"
                    name="ownerCode"
                    value={ownerCode}
                    onChange={(event) => setOwnerCode(event.target.value.toUpperCase())}
                    disabled={submitting}
                    placeholder="XXXX-XXXX"
                    dir="ltr"
                    maxLength={9}
                    className={inputClass}
                    style={{
                      fontFamily: "JetBrains Mono",
                      borderColor: fieldErrors.ownerCode ? "#FF6B35" : "#EAECF0",
                    }}
                  />
                  {fieldErrors.ownerCode && (
                    <p className="text-[12px] mt-1 text-[#FF6B35]">{fieldErrors.ownerCode}</p>
                  )}
                </div>
              )}
            </>
          )}

          {formError && (
            <div
              className="rounded-lg px-4 py-3 text-[13px]"
              style={{ background: "rgba(255,107,53,0.08)", color: "#FF6B35" }}
              role="alert"
            >
              {formError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-[#00A859] text-white rounded-full text-[14px] hover:bg-[#009150] transition-colors mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ fontFamily: font, fontWeight: 500 }}
          >
            {submitting
              ? "…"
              : tab === "signin"
                ? l.signInBtn
                : l.createAccountBtn}
          </button>
        </form>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-[#EAECF0]" />
          <span className="text-[11px] text-[#9CA3AF]" style={{ fontFamily: font }}>
            {l.or}
          </span>
          <div className="flex-1 h-px bg-[#EAECF0]" />
        </div>

        {/*
          Google sign-in is not implemented. The button is disabled rather than left clickable,
          because a control that silently does nothing is worse than one that is visibly unavailable.
        */}
        <button
          type="button"
          disabled
          title="Google sign-in is not available yet"
          className="w-full py-3 border border-[#EAECF0] rounded-full text-[14px] text-[#9CA3AF] flex items-center justify-center gap-2 opacity-60 cursor-not-allowed"
          style={{ fontFamily: font }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          {l.continueGoogle}
        </button>

        {tab === "signin" && (
          <p className="text-[12px] text-[#9CA3AF] text-center mt-6" style={{ fontFamily: font }}>
            Demo: owner@semico.dz · Semico2026!
          </p>
        )}
      </div>
    </div>
  );
}
