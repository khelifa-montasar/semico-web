import { useId, type ButtonHTMLAttributes } from "react";
import type { Locale, PaginationMeta } from "@semico/shared";
import { useLanguage } from "@/app/contexts/LanguageContext";
import { useTokens } from "@/app/hooks/useTokens";

export function CmsButton({
  danger,
  children,
  className = "",
  style,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  const tokens = useTokens();
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      className={`rounded-lg border px-3 py-2 text-sm disabled:opacity-50 ${className}`}
      style={{
        background: tokens.card,
        borderColor: tokens.border,
        color: danger ? tokens.crit : tokens.text,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

interface CmsFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  language?: Locale;
  type?: "text" | "number" | "date" | "url";
  multiline?: boolean;
  required?: boolean;
  maxLength?: number;
  min?: number;
  step?: string;
}

export function CmsField({
  label,
  value,
  onChange,
  language,
  type = "text",
  multiline,
  required,
  maxLength,
  min,
  step,
}: CmsFieldProps) {
  const id = useId();
  const tokens = useTokens();
  const fieldProps = {
    id,
    value,
    required,
    maxLength,
    lang: language,
    dir:
      language === "ar"
        ? ("rtl" as const)
        : language === "en"
          ? ("ltr" as const)
          : undefined,
    className: "w-full rounded-lg border px-3 py-2 text-sm",
    style: {
      background: tokens.inputBg,
      borderColor: tokens.border,
      color: tokens.text,
    },
  };
  return (
    <label htmlFor={id} className="flex flex-col gap-2 text-sm">
      <span>{label}</span>
      {multiline ? (
        <textarea
          {...fieldProps}
          rows={6}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          {...fieldProps}
          type={type}
          min={min}
          step={step}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

export function CmsFeedback({
  loading,
  error,
  retry,
}: {
  loading?: boolean;
  error?: boolean;
  retry: () => void;
}) {
  const { t } = useLanguage();
  const tokens = useTokens();
  if (error)
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-3 rounded-lg border p-4"
        style={{ color: tokens.crit, borderColor: tokens.crit }}
      >
        <p>{t.admin.cms.loadError}</p>
        <CmsButton onClick={retry}>{t.admin.retry}</CmsButton>
      </div>
    );
  if (loading) return <p role="status">{t.admin.cms.loading}</p>;
  return null;
}

export function CmsPagination({
  meta,
  busy,
  onPageChange,
}: {
  meta?: PaginationMeta;
  busy: boolean;
  onPageChange: (page: number) => void;
}) {
  const { t } = useLanguage();
  if (!meta || meta.totalPages <= 1) return null;
  const copy = t.admin.cms;
  return (
    <nav
      aria-label={`${copy.page} ${meta.page}`}
      className="flex items-center justify-between gap-3"
    >
      <CmsButton
        disabled={busy || meta.page <= 1}
        onClick={() => onPageChange(meta.page - 1)}
      >
        {copy.previous}
      </CmsButton>
      <p className="text-sm">
        {copy.page} {meta.page} {copy.of} {meta.totalPages}
      </p>
      <CmsButton
        disabled={busy || meta.page >= meta.totalPages}
        onClick={() => onPageChange(meta.page + 1)}
      >
        {copy.next}
      </CmsButton>
    </nav>
  );
}
