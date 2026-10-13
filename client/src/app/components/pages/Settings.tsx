import { useEffect, useRef, useState } from "react";
import {
  User, Camera, Plus, Pencil, Trash2, ChevronDown,
  MoreHorizontal, X, Briefcase, GraduationCap, UserPlus,
  Shield, Eye, Sun, Moon, Monitor, Check,
} from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "../../contexts/LanguageContext";
import { useTheme, ThemePreference } from "../../contexts/ThemeContext";
import { useTokens } from "../../hooks/useTokens";
import { useDebounced } from "../../hooks/useDebounced";
import { useLocalized } from "../../hooks/useLocalized";
import { useAuth } from "@/features/auth/AuthContext";
import { useWilayas } from "../../../features/content/useContent";
import { useIrrigate } from "../../../features/dashboard/useDashboard";
import {
  useAddEducation,
  useAddExperience,
  useDeleteEducation,
  useDeleteExperience,
  useFarmSettings,
  useProfile,
  useUpdateEducation,
  useUpdateExperience,
  useUpdateFarmSettings,
  useUpdateProfile,
} from "../../../features/settings/useSettings";
import {
  useInviteWorker,
  useRemoveWorker,
  useResetWorkerPassword,
  useSetValve,
  useSetValveControl,
  useWorkers,
} from "../../../features/workers/useWorkers";
import { useLeads, useUpdateLead } from "../../../features/leads/useLeads";
import { farmDateLabel } from "../../../lib/time";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExperienceEntry {
  id: string;
  jobTitle: string;
  company: string;
  startDate: string;
  endDate: string;
  isPresent: boolean;
  description: string;
}

interface EducationEntry {
  id: string;
  degree: string;
  institution: string;
  year: string;
}

type WorkerType = "operator" | "observer";
type WorkerStatus = "active" | "invited";

interface WorkerEntry {
  id: string;
  initials: string;
  name: string;
  email: string;
  type: WorkerType;
  valveControl: boolean;
  status: WorkerStatus;
}

// The wilaya list, the worker rows, experience and education all come from the API now — see
// `features/settings/useSettings.ts` and `features/workers/useWorkers.ts`. They used to be
// hardcoded here, which meant edits appeared to succeed and then vanished on reload.

const EMPTY_EXP = { jobTitle: "", company: "", startDate: "", endDate: "", isPresent: false, description: "" };
const EMPTY_EDU = { degree: "", institution: "", year: "" };

// ─── Shared micro-components ─────────────────────────────────────────────────

function FieldLabel({ children, isRTL, font }: { children: React.ReactNode; isRTL: boolean; font: string }) {
  return (
    <span
      className="block text-[10px] text-[#9CA3AF] dark:text-[#8B949E] mb-2 tracking-wider"
      style={{ fontFamily: isRTL ? font : "JetBrains Mono", textTransform: isRTL ? "none" : "uppercase" }}
    >
      {children}
    </span>
  );
}

function MinInput({
  value, onChange, placeholder, disabled, type = "text", dir, font,
}: {
  value: string; onChange?: (v: string) => void; placeholder?: string;
  disabled?: boolean; type?: string; dir?: string; font: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      dir={dir}
      className="w-full h-[48px] border-b border-[#EAECF0] dark:border-[#30363D] outline-none text-[15px] text-[#1A1A1A] dark:text-[#C9D1D9] bg-transparent disabled:opacity-40 disabled:cursor-not-allowed placeholder:text-[#D1D5DB] dark:placeholder:text-[#484F58]"
      style={{ fontFamily: font }}
    />
  );
}

function MinTextarea({
  value, onChange, placeholder, rows = 3, font, maxLength,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  rows?: number; font: string; maxLength?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      maxLength={maxLength}
      className="w-full border border-[#EAECF0] dark:border-[#30363D] rounded-lg outline-none text-[14px] text-[#1A1A1A] dark:text-[#C9D1D9] bg-transparent resize-none p-4 placeholder:text-[#D1D5DB] dark:placeholder:text-[#484F58] focus:border-[#00A859] dark:focus:border-[#3FB950] transition-colors"
      style={{ fontFamily: font, lineHeight: 1.6 }}
    />
  );
}

function PillToggle({ value, onChange }: { value: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${
        value ? "bg-[#00A859] dark:bg-[#3FB950]" : "bg-[#D1D5DB] dark:bg-[#30363D]"
      }`}
    >
      <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${value ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

function Divider() {
  return <div className="h-px bg-[#EAECF0] dark:bg-[#30363D]" />;
}

// ─── Main Settings Component ──────────────────────────────────────────────────

export function Settings() {
  const { t, lang, isRTL, font } = useLanguage();
  const { theme: currentTheme, setTheme, effectiveTheme } = useTheme();
  const isDark = effectiveTheme === "dark";
  const s = t.settings;

  const p = s.profile;
  const wt = s.workers;
  const ap = s.appearance;
  const sl = s.leads;

  // Shared tokens plus the three surfaces only this page uses, kept under their original names so
  // the markup below is untouched.
  const tokens = useTokens();
  const c = {
    ...tokens,
    formBg: isDark ? "#0D1117" : "#FAFAFA",
    avatarBg: isDark ? "#21262D" : "#F3F4F6",
    iconBg: isDark ? "rgba(63,185,80,0.12)" : "rgba(0,168,89,0.12)",
  };

  // The server enforces ownership on every worker endpoint. This used to be hardcoded `true`, so
  // the UI offered worker management to everyone — including observers, who would then be refused.
  const { user } = useAuth();
  const isAdmin = user?.role === "OWNER";

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Server data ────────────────────────────────────────────────────────────
  const profile = useProfile();
  const wilayas = useWilayas();
  const L = useLocalized();
  const farmSettings = useFarmSettings();
  const workersQuery = useWorkers();

  const updateProfile = useUpdateProfile();
  const addExperienceMutation = useAddExperience();
  const updateExperienceMutation = useUpdateExperience();
  const deleteExperienceMutation = useDeleteExperience();
  const addEducationMutation = useAddEducation();
  const updateEducationMutation = useUpdateEducation();
  const deleteEducationMutation = useDeleteEducation();
  // Destructured so the effect below can depend on the (stable) `mutate` function rather than the
  // mutation object, whose identity is new on every render — which would re-run the effect forever.
  const { mutate: saveThreshold } = useUpdateFarmSettings();
  const inviteWorker = useInviteWorker();
  const setValveControl = useSetValveControl();
  const removeWorkerMutation = useRemoveWorker();
  const resetWorkerPassword = useResetWorkerPassword();
  const setValve = useSetValve();
  const leads = useLeads();
  const updateLead = useUpdateLead();
  // "Open valve for N minutes" is an irrigation command, not a bare valve toggle — it carries the
  // duration the user typed.
  const irrigate = useIrrigate();

  function reportError(error: unknown, fallback: string) {
    toast.error(error instanceof Error ? error.message : fallback);
  }

  // ── Profile form state
  // Seeded from the server once it arrives, then owned locally while the user edits — so typing is
  // never interrupted by a refetch.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarHover, setAvatarHover] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileWilaya, setProfileWilaya] = useState("");
  const [profileCommune, setProfileCommune] = useState("");
  const [bio, setBio] = useState("");

  const profileEmail = profile.data?.email ?? "";

  useEffect(() => {
    const loaded = profile.data;
    if (!loaded) return;
    setProfileName(loaded.fullName);
    setProfilePhone(loaded.phone ?? "");
    setProfileWilaya(loaded.wilayaId ?? "");
    setProfileCommune(loaded.commune ?? "");
    setBio(loaded.bio ?? "");
    setAvatarUrl(loaded.avatarUrl ?? null);
  }, [profile.data]);

  // ── Experience / education drafts
  const [addingExp, setAddingExp] = useState(false);
  const [newExp, setNewExp] = useState({ ...EMPTY_EXP });
  const [editingExpId, setEditingExpId] = useState<string | null>(null);
  const [editExpData, setEditExpData] = useState({ ...EMPTY_EXP });
  const [hoveredExpId, setHoveredExpId] = useState<string | null>(null);

  const [addingEdu, setAddingEdu] = useState(false);
  const [newEdu, setNewEdu] = useState({ ...EMPTY_EDU });
  const [editingEduId, setEditingEduId] = useState<string | null>(null);
  const [editEduData, setEditEduData] = useState({ ...EMPTY_EDU });
  const [hoveredEduId, setHoveredEduId] = useState<string | null>(null);

  // Mapped onto the page's own shapes so the markup below needs no changes.
  const experiences: ExperienceEntry[] = (profile.data?.experiences ?? []).map((entry) => ({
    id: entry.id,
    jobTitle: entry.jobTitle,
    company: entry.company,
    startDate: entry.startDate,
    endDate: entry.endDate ?? "",
    isPresent: entry.isPresent,
    description: entry.description ?? "",
  }));

  const educations: EducationEntry[] = (profile.data?.educations ?? []).map((entry) => ({
    id: entry.id,
    degree: entry.degree,
    institution: entry.institution,
    year: entry.year ?? "",
  }));

  // ── Worker state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [inviteForm, setInviteForm] = useState({
    name: "", email: "", type: "operator" as WorkerType, grantValve: false,
  });

  const workers: WorkerEntry[] = (workersQuery.data ?? []).map((worker) => ({
    id: worker.id,
    initials: worker.initials,
    name: worker.name,
    email: worker.email,
    type: worker.type === "OPERATOR" ? "operator" : "observer",
    valveControl: worker.valveControl,
    status: worker.status === "ACTIVE" ? "active" : "invited",
  }));

  // ── Farm settings (thresholds and preferences)
  const [moistureThreshold, setMoistureThreshold] = useState(40);
  const [autoIrrigation, setAutoIrrigation] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [overrideMin, setOverrideMin] = useState(15);

  useEffect(() => {
    const loaded = farmSettings.data;
    if (!loaded) return;
    setMoistureThreshold(loaded.moistureThreshold);
    setAutoIrrigation(loaded.autoIrrigation);
    setNotifications(loaded.pushNotifications);
  }, [farmSettings.data]);

  // The slider fires on every step, so only the settled value is persisted — and only when it
  // actually differs from the server's, or loading the page would immediately write back what it
  // just read.
  const settledThreshold = useDebounced(moistureThreshold, 500);
  const savedThreshold = farmSettings.data?.moistureThreshold;

  useEffect(() => {
    if (savedThreshold === undefined || settledThreshold === savedThreshold) return;
    saveThreshold({ moistureThreshold: settledThreshold });
  }, [settledThreshold, savedThreshold, saveThreshold]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Still a local preview: there is no upload endpoint, so this is a blob: URL that dies on
    // reload. The profile stores an avatar *URL*, not an uploaded file.
    if (file) setAvatarUrl(URL.createObjectURL(file));
  }

  function handleSaveProfile() {
    updateProfile.mutate(
      {
        fullName: profileName.trim(),
        phone: profilePhone.trim(),
        wilayaId: profileWilaya,
        commune: profileCommune.trim(),
        bio,
        // Only persist a real URL; a blob: preview is not a storable value.
        ...(avatarUrl && /^https?:\/\//.test(avatarUrl) ? { avatarUrl } : {}),
      },
      {
        onSuccess: () => toast.success(p.savedToast, { duration: 3000 }),
        onError: (error) => reportError(error, "Could not save your profile."),
      },
    );
  }

  function handleThemeChange(selected: ThemePreference) {
    setTheme(selected);
    toast(ap.updatedToast, { duration: 2500 });
  }

  function addExperience() {
    if (!newExp.jobTitle.trim()) return;
    addExperienceMutation.mutate(
      {
        jobTitle: newExp.jobTitle.trim(),
        company: newExp.company.trim(),
        startDate: newExp.startDate.trim(),
        isPresent: newExp.isPresent,
        ...(newExp.isPresent ? {} : { endDate: newExp.endDate.trim() }),
        ...(newExp.description.trim() ? { description: newExp.description.trim() } : {}),
      },
      {
        onSuccess: () => {
          setNewExp({ ...EMPTY_EXP });
          setAddingExp(false);
        },
        onError: (error) => reportError(error, "Could not add that entry."),
      },
    );
  }

  function deleteExperience(id: string) {
    deleteExperienceMutation.mutate(id, {
      onError: (error) => reportError(error, "Could not delete that entry."),
    });
  }

  function startEditExp(exp: ExperienceEntry) {
    setEditingExpId(exp.id);
    setEditExpData({ jobTitle: exp.jobTitle, company: exp.company, startDate: exp.startDate, endDate: exp.endDate, isPresent: exp.isPresent, description: exp.description });
  }

  function saveEditExp(id: string) {
    updateExperienceMutation.mutate(
      {
        id,
        input: {
          jobTitle: editExpData.jobTitle.trim(),
          company: editExpData.company.trim(),
          startDate: editExpData.startDate.trim(),
          isPresent: editExpData.isPresent,
          ...(editExpData.isPresent ? {} : { endDate: editExpData.endDate.trim() }),
          ...(editExpData.description.trim() ? { description: editExpData.description.trim() } : {}),
        },
      },
      {
        onSuccess: () => setEditingExpId(null),
        onError: (error) => reportError(error, "Could not save that entry."),
      },
    );
  }

  function addEducation() {
    if (!newEdu.degree.trim()) return;
    addEducationMutation.mutate(
      {
        degree: newEdu.degree.trim(),
        institution: newEdu.institution.trim(),
        ...(newEdu.year.trim() ? { year: newEdu.year.trim() } : {}),
      },
      {
        onSuccess: () => {
          setNewEdu({ ...EMPTY_EDU });
          setAddingEdu(false);
        },
        onError: (error) => reportError(error, "Could not add that entry."),
      },
    );
  }

  function deleteEducation(id: string) {
    deleteEducationMutation.mutate(id, {
      onError: (error) => reportError(error, "Could not delete that entry."),
    });
  }

  function startEditEdu(edu: EducationEntry) {
    setEditingEduId(edu.id);
    setEditEduData({ degree: edu.degree, institution: edu.institution, year: edu.year });
  }

  function saveEditEdu(id: string) {
    updateEducationMutation.mutate(
      {
        id,
        input: {
          degree: editEduData.degree.trim(),
          institution: editEduData.institution.trim(),
          ...(editEduData.year.trim() ? { year: editEduData.year.trim() } : {}),
        },
      },
      {
        onSuccess: () => setEditingEduId(null),
        onError: (error) => reportError(error, "Could not save that entry."),
      },
    );
  }

  /** Grant or revoke valve control. The server records it in the audit trail. */
  function toggleValveControl(workerId: string) {
    const worker = workers.find((w) => w.id === workerId);
    if (!worker) return;

    setValveControl.mutate(
      { id: workerId, granted: !worker.valveControl },
      {
        // The server refuses this for an observer, and for an operator only while they hold the
        // OPERATOR type — so surface its reason rather than leaving the toggle looking stuck.
        onError: (error) => reportError(error, "Could not change valve control."),
      },
    );
  }

  function removeWorker(workerId: string) {
    setOpenMenuId(null);
    removeWorkerMutation.mutate(workerId, {
      onError: (error) => reportError(error, "Could not remove that worker."),
    });
  }

  function resetWorkerPwd(workerId: string) {
    setOpenMenuId(null);
    resetWorkerPassword.mutate(workerId, {
      onSuccess: (result) => {
        // No email delivery in this project, so the owner has to relay this themselves.
        toast.success(`${wt.resetPwd}: ${result.temporaryPassword}`, { duration: 15_000 });
      },
      onError: (error) => reportError(error, "Could not reset that password."),
    });
  }

  function sendInvite() {
    if (!inviteForm.name.trim() || !inviteForm.email.trim()) return;

    inviteWorker.mutate(
      {
        name: inviteForm.name.trim(),
        email: inviteForm.email.trim(),
        type: inviteForm.type === "operator" ? "OPERATOR" : "OBSERVER",
        grantValve: inviteForm.type === "operator" && inviteForm.grantValve,
      },
      {
        onSuccess: (result) => {
          setShowInviteModal(false);
          setInviteForm({ name: "", email: "", type: "operator", grantValve: false });
          // The one-time password is returned exactly once; there is no mail delivery, so showing
          // it here is the only way the owner can pass it on.
          toast.success(`${wt.invitedToast} — ${result.temporaryPassword}`, { duration: 15_000 });
        },
        onError: (error) => reportError(error, "Could not send that invitation."),
      },
    );
  }

  // ─── Render helpers ─────────────────────────────────────────────────────────

  function ExpForm(
    data: typeof EMPTY_EXP,
    setData: (d: typeof EMPTY_EXP) => void,
    onSave: () => void,
    onCancel: () => void,
  ) {
    return (
      <div className="rounded-lg p-6 flex flex-col gap-5" style={{ border: `1px solid ${c.border}`, background: c.formBg }}>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5">
          <div>
            <FieldLabel isRTL={isRTL} font={font}>{p.jobTitleLabel}</FieldLabel>
            <MinInput value={data.jobTitle} onChange={(v) => setData({ ...data, jobTitle: v })} placeholder={p.jobTitlePlaceholder} font={font} />
          </div>
          <div>
            <FieldLabel isRTL={isRTL} font={font}>{p.companyLabel}</FieldLabel>
            <MinInput value={data.company} onChange={(v) => setData({ ...data, company: v })} placeholder={p.companyPlaceholder} font={font} />
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-x-8 gap-y-3 items-end">
          <div>
            <FieldLabel isRTL={isRTL} font={font}>{p.datesLabel}</FieldLabel>
            <MinInput value={data.startDate} onChange={(v) => setData({ ...data, startDate: v })} placeholder={p.startDatePlaceholder} font={font} />
          </div>
          <div>
            <FieldLabel isRTL={isRTL} font={font}>&nbsp;</FieldLabel>
            <MinInput value={data.isPresent ? "" : data.endDate} onChange={(v) => setData({ ...data, endDate: v, isPresent: false })} placeholder={p.endDatePlaceholder} font={font} disabled={data.isPresent} />
          </div>
          <label className="flex items-center gap-2 pb-2 cursor-pointer">
            <input type="checkbox" checked={data.isPresent} onChange={(e) => setData({ ...data, isPresent: e.target.checked, endDate: "" })} className="accent-[#00A859]" />
            <span className="text-[13px] text-[#6B7280]" style={{ fontFamily: font }}>{p.present}</span>
          </label>
        </div>
        <div>
          <FieldLabel isRTL={isRTL} font={font}>{p.descLabel}</FieldLabel>
          <MinTextarea value={data.description} onChange={(v) => setData({ ...data, description: v })} placeholder={p.descPlaceholder} font={font} rows={3} />
        </div>
        <div className="flex gap-3">
          <button onClick={onSave} className="px-5 py-2 text-white rounded-full text-[13px] transition-colors" style={{ background: c.green, fontFamily: font, fontWeight: 500 }}>{p.saveEntry}</button>
          <button onClick={onCancel} className="px-5 py-2 rounded-full text-[13px] transition-colors" style={{ border: `1px solid ${c.border}`, color: c.text, fontFamily: font }}>{p.cancelEntry}</button>
        </div>
      </div>
    );
  }

  function EduForm(
    data: typeof EMPTY_EDU,
    setData: (d: typeof EMPTY_EDU) => void,
    onSave: () => void,
    onCancel: () => void,
  ) {
    return (
      <div className="rounded-lg p-6 flex flex-col gap-5" style={{ border: `1px solid ${c.border}`, background: c.formBg }}>
        <div>
          <FieldLabel isRTL={isRTL} font={font}>{p.degreeLabel}</FieldLabel>
          <MinInput value={data.degree} onChange={(v) => setData({ ...data, degree: v })} placeholder={p.degreePlaceholder} font={font} />
        </div>
        <div className="grid sm:grid-cols-3 gap-x-8 gap-y-5">
          <div className="sm:col-span-2">
            <FieldLabel isRTL={isRTL} font={font}>{p.institutionLabel}</FieldLabel>
            <MinInput value={data.institution} onChange={(v) => setData({ ...data, institution: v })} placeholder={p.institutionPlaceholder} font={font} />
          </div>
          <div>
            <FieldLabel isRTL={isRTL} font={font}>{p.yearLabel}</FieldLabel>
            <MinInput value={data.year} onChange={(v) => setData({ ...data, year: v })} placeholder={p.yearPlaceholder} font={font} dir="ltr" />
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onSave} className="px-5 py-2 text-white rounded-full text-[13px] transition-colors" style={{ background: c.green, fontFamily: font, fontWeight: 500 }}>{p.saveEntry}</button>
          <button onClick={onCancel} className="px-5 py-2 rounded-full text-[13px] transition-colors" style={{ border: `1px solid ${c.border}`, color: c.text, fontFamily: font }}>{p.cancelEntry}</button>
        </div>
      </div>
    );
  }

  // ─── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[760px] flex flex-col" style={{ fontFamily: font }}>

      {/* ════════════════════════════════════════
          SECTION A — PROFILE & BIOGRAPHY
      ════════════════════════════════════════ */}
      <section className="py-6">
        <h2
          className="text-[20px] mb-8"
          style={{ fontWeight: 500, fontFamily: font, color: c.text }}
        >
          {p.sectionTitle}
        </h2>

        {/* ── A1: Avatar + Basic Fields ─────── */}
        <div className="flex flex-col sm:flex-row gap-8 mb-10">
          {/* Avatar */}
          <div className="shrink-0 flex flex-col items-center gap-3">
            <div
              className="relative w-24 h-24 rounded-full cursor-pointer overflow-hidden"
              style={{ border: `1px solid ${c.border}` }}
              onMouseEnter={() => setAvatarHover(true)}
              onMouseLeave={() => setAvatarHover(false)}
              onClick={() => fileInputRef.current?.click()}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center" style={{ background: c.avatarBg }}>
                  <User size={36} strokeWidth={1.5} style={{ color: c.sec }} />
                </div>
              )}
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-1 transition-opacity"
                style={{
                  background: "rgba(0,0,0,0.3)",
                  opacity: avatarHover ? 1 : 0,
                }}
              >
                <Camera size={18} strokeWidth={1.5} className="text-white" />
                <span className="text-white text-[10px] text-center px-1 leading-tight" style={{ fontFamily: font }}>
                  {p.changePhoto}
                </span>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFile} />
          </div>

          {/* Basic fields */}
          <div className="flex-1 grid sm:grid-cols-2 gap-x-8 gap-y-6">
            {/* Full Name */}
            <div>
              <FieldLabel isRTL={isRTL} font={font}>{p.fullName}</FieldLabel>
              <MinInput value={profileName} onChange={setProfileName} placeholder={p.namePlaceholder} font={font} />
            </div>
            {/* Email (read-only) */}
            <div>
              <FieldLabel isRTL={isRTL} font={font}>{p.emailLabel}</FieldLabel>
              <MinInput value={profileEmail} disabled font={font} dir="ltr" />
            </div>
            {/* Phone */}
            <div>
              <FieldLabel isRTL={isRTL} font={font}>{p.phoneLabel}</FieldLabel>
              <MinInput value={profilePhone} onChange={setProfilePhone} placeholder={p.phonePlaceholder} font={font} dir="ltr" />
            </div>
            {/* Wilaya */}
            <div>
              <FieldLabel isRTL={isRTL} font={font}>{p.wilayadLabel}</FieldLabel>
              <div className="relative">
                <select
                  value={profileWilaya}
                  onChange={(e) => setProfileWilaya(e.target.value)}
                  className="w-full h-[48px] border-b border-[#EAECF0] outline-none text-[15px] bg-transparent appearance-none pe-6"
                  style={{ fontFamily: font }}
                >
                  <option value="">{p.selectWilaya}</option>
                  {(wilayas.data ?? []).map((w) => (
                    <option key={w.code} value={w.code}>
                      {w.code} - {L(w.name)}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} strokeWidth={1.5} className="absolute end-1 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none" />
              </div>
            </div>
            {/* Commune */}
            <div>
              <FieldLabel isRTL={isRTL} font={font}>{p.communeLabel}</FieldLabel>
              <MinInput value={profileCommune} onChange={setProfileCommune} placeholder={p.communePlaceholder} font={font} />
            </div>
          </div>
        </div>

        {/* ── A2: Professional Experience ───── */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[16px]" style={{ fontWeight: 500, fontFamily: font, color: c.text }}>
              {p.experience}
            </h3>
            <button
              onClick={() => { setAddingExp(true); setNewExp({ ...EMPTY_EXP }); }}
              className="flex items-center gap-1.5 text-[13px] transition-colors"
              style={{ fontFamily: font, color: c.green }}
            >
              <Plus size={14} strokeWidth={1.5} />
              {p.addExperience}
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {experiences.length === 0 && !addingExp && (
              <div className="border border-dashed rounded-lg p-8 text-center" style={{ borderColor: c.border }}>
                <Briefcase size={28} strokeWidth={1.5} className="mx-auto mb-3" style={{ color: c.sec }} />
                <p className="text-[13px] max-w-[360px] mx-auto" style={{ fontFamily: font, lineHeight: 1.6, color: c.sec }}>
                  {p.emptyExperience}
                </p>
              </div>
            )}

            {experiences.map((exp) => (
              <div key={exp.id}>
                {editingExpId === exp.id
                  ? ExpForm(editExpData, setEditExpData, () => saveEditExp(exp.id), () => setEditingExpId(null))
                  : (
                    <div
                      className="rounded-lg p-5 transition-colors"
                      style={{ border: `1px solid ${c.border}` }}
                      onMouseEnter={() => setHoveredExpId(exp.id)}
                      onMouseLeave={() => setHoveredExpId(null)}
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-[16px] mb-0.5" style={{ fontWeight: 500, fontFamily: font, color: c.text }}>
                            {exp.jobTitle}
                          </p>
                          <p className="text-[14px] mb-1" style={{ fontFamily: font, color: c.sec }}>
                            {exp.company}
                          </p>
                          <p className="text-[11px]" style={{ fontFamily: "JetBrains Mono", textTransform: "uppercase", letterSpacing: "0.06em", color: c.sec }}>
                            {exp.startDate} — {exp.isPresent ? p.present : exp.endDate}
                          </p>
                          {exp.description && (
                            <p className="text-[13px] mt-2" style={{ fontFamily: font, lineHeight: 1.6, color: c.sec }}>
                              {exp.description}
                            </p>
                          )}
                        </div>
                        <div
                          className="flex items-center gap-1 shrink-0 transition-opacity"
                          style={{ opacity: hoveredExpId === exp.id ? 1 : 0 }}
                        >
                          <button
                            onClick={() => startEditExp(exp)}
                            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                            style={{ color: c.sec }}
                            title={p.editBtn}
                          >
                            <Pencil size={14} strokeWidth={1.5} />
                          </button>
                          <button
                            onClick={() => deleteExperience(exp.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors text-[#EF4444] dark:text-[#F85149]"
                            title={p.deleteBtn}
                          >
                            <Trash2 size={14} strokeWidth={1.5} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            ))}

            {addingExp && ExpForm(newExp, setNewExp, addExperience, () => { setAddingExp(false); setNewExp({ ...EMPTY_EXP }); })}
          </div>
        </div>

        {/* ── A3: Education & Certifications ── */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[16px]" style={{ fontWeight: 500, fontFamily: font, color: c.text }}>
              {p.education}
            </h3>
            <button
              onClick={() => { setAddingEdu(true); setNewEdu({ ...EMPTY_EDU }); }}
              className="flex items-center gap-1.5 text-[13px] transition-colors"
              style={{ fontFamily: font, color: c.green }}
            >
              <Plus size={14} strokeWidth={1.5} />
              {p.addEducation}
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {educations.length === 0 && !addingEdu && (
              <div className="border border-dashed rounded-lg p-8 text-center" style={{ borderColor: c.border }}>
                <GraduationCap size={28} strokeWidth={1.5} className="mx-auto mb-3" style={{ color: c.sec }} />
                <p className="text-[13px] max-w-[360px] mx-auto" style={{ fontFamily: font, lineHeight: 1.6, color: c.sec }}>
                  {p.emptyEducation}
                </p>
              </div>
            )}

            {educations.map((edu) => (
              <div key={edu.id}>
                {editingEduId === edu.id
                  ? EduForm(editEduData, setEditEduData, () => saveEditEdu(edu.id), () => setEditingEduId(null))
                  : (
                    <div
                      className="rounded-lg p-5 transition-colors"
                      style={{ border: `1px solid ${c.border}` }}
                      onMouseEnter={() => setHoveredEduId(edu.id)}
                      onMouseLeave={() => setHoveredEduId(null)}
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-[16px] mb-0.5" style={{ fontWeight: 500, fontFamily: font, color: c.text }}>
                            {edu.degree}
                          </p>
                          <p className="text-[14px]" style={{ fontFamily: font, color: c.sec }}>{edu.institution}</p>
                          {edu.year && (
                            <p className="text-[11px] mt-1" style={{ fontFamily: "JetBrains Mono", textTransform: "uppercase", letterSpacing: "0.06em", color: c.sec }}>
                              {edu.year}
                            </p>
                          )}
                        </div>
                        <div
                          className="flex items-center gap-1 shrink-0 transition-opacity"
                          style={{ opacity: hoveredEduId === edu.id ? 1 : 0 }}
                        >
                          <button
                            onClick={() => startEditEdu(edu)}
                            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                            style={{ color: c.sec }}
                            title={p.editBtn}
                          >
                            <Pencil size={14} strokeWidth={1.5} />
                          </button>
                          <button
                            onClick={() => deleteEducation(edu.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-full transition-colors text-[#EF4444] dark:text-[#F85149]"
                            title={p.deleteBtn}
                          >
                            <Trash2 size={14} strokeWidth={1.5} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            ))}

            {addingEdu && EduForm(newEdu, setNewEdu, addEducation, () => { setAddingEdu(false); setNewEdu({ ...EMPTY_EDU }); })}
          </div>
        </div>

        {/* ── A4: About / Biography ─────────── */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[16px]" style={{ fontWeight: 500, fontFamily: font, color: c.text }}>
              {p.about}
            </h3>
            <span className="text-[11px]" style={{ fontFamily: "JetBrains Mono", color: c.sec }}>
              {bio.length}/500
            </span>
          </div>
          <MinTextarea
            value={bio} onChange={setBio}
            placeholder={p.bioPlaceholder}
            rows={5} font={font} maxLength={500}
          />
        </div>

        {/* ── A5: Save / Cancel ─────────────── */}
        <div className={`flex gap-3 ${isRTL ? "" : "justify-end"}`}>
          <button
            className="px-6 py-2.5 rounded-full text-[14px] transition-colors"
            style={{ border: `1px solid ${c.border}`, color: c.text, fontFamily: font }}
          >
            {p.cancelBtn}
          </button>
          <button
            onClick={handleSaveProfile}
            className="px-6 py-2.5 text-white rounded-full text-[14px] transition-colors"
            style={{ background: c.green, fontFamily: font, fontWeight: 500 }}
          >
            {p.saveChanges}
          </button>
        </div>
      </section>

      <Divider />

      {/* ════════════════════════════════════════
          SECTION B — APPEARANCE
      ════════════════════════════════════════ */}
      <section className="py-6">
        <h2
          className="text-[20px] mb-6"
          style={{ fontWeight: 500, fontFamily: font, color: c.text }}
        >
          {ap.sectionTitle}
        </h2>

        <div className="grid sm:grid-cols-3 gap-3">
          {(
            [
              { key: "light" as ThemePreference, Icon: Sun,     label: ap.light,  desc: ap.lightDesc  },
              { key: "dark"  as ThemePreference, Icon: Moon,    label: ap.dark,   desc: ap.darkDesc   },
              { key: "system"as ThemePreference, Icon: Monitor, label: ap.system, desc: ap.systemDesc },
            ] as const
          ).map(({ key, Icon, label, desc }) => {
            const selected = currentTheme === key;
            return (
              <button
                key={key}
                onClick={() => handleThemeChange(key)}
                className="relative flex items-center gap-3 w-full text-start rounded-lg px-4 py-4 transition-all cursor-pointer"
                style={{
                  border: `1px solid ${selected ? c.green : c.border}`,
                  background: selected ? c.iconBg : "transparent",
                }}
              >
                <span
                  className="shrink-0 flex items-center justify-center w-8 h-8 rounded-full"
                  style={{ background: selected ? c.iconBg : c.avatarBg }}
                >
                  <Icon size={15} strokeWidth={1.5} style={{ color: selected ? c.green : c.sec }} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px]" style={{ fontFamily: font, fontWeight: 500, color: selected ? c.text : c.sec }}>
                    {label}
                  </p>
                  <p className="text-[11px] mt-0.5 leading-snug" style={{ fontFamily: font, color: c.sec }}>
                    {desc}
                  </p>
                </div>
                <span className="shrink-0 transition-opacity" style={{ opacity: selected ? 1 : 0 }}>
                  <Check size={15} strokeWidth={2} color={c.green} />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <Divider />

      {/* ════════════════════════════════════════
          IRRIGATION THRESHOLDS (existing)
      ════════════════════════════════════════ */}
      <section className="py-6">
        <h3 className="text-[14px] mb-4" style={{ fontFamily: font, fontWeight: 500, color: c.text }}>
          {s.irrigationThresholds}
        </h3>
        <div>
          <label className="text-[12px] mb-2 block" style={{ fontFamily: font, color: c.sec }}>
            {s.moistureThreshold}
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range" min={10} max={80} value={moistureThreshold}
              onChange={(e) => setMoistureThreshold(Number(e.target.value))}
              className="flex-1" style={{ accentColor: c.green }} dir="ltr"
            />
            <span className="text-[14px] w-10 text-end" style={{ fontFamily: "JetBrains Mono", color: c.text }}>
              {moistureThreshold}%
            </span>
          </div>
        </div>
      </section>

      <Divider />

      {/* ════════════════════════════════════════
          PREFERENCES (existing)
      ════════════════════════════════════════ */}
      <section className="py-6 flex flex-col gap-4">
        <h3 className="text-[14px] mb-2" style={{ fontFamily: font, fontWeight: 500, color: c.text }}>
          {s.preferences}
        </h3>
        {[
          { label: s.autoIrrigation, value: autoIrrigation, toggle: () => setAutoIrrigation((v) => !v) },
          { label: s.pushNotifications, value: notifications, toggle: () => setNotifications((v) => !v) },
        ].map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <span className="text-[13px]" style={{ fontFamily: font, color: c.text }}>{item.label}</span>
            <PillToggle value={item.value} onChange={item.toggle} />
          </div>
        ))}
      </section>

      <Divider />

      {/* ════════════════════════════════════════
          MANUAL OVERRIDE (existing)
      ════════════════════════════════════════ */}
      <section className="py-6">
        <h3 className="text-[14px] mb-4" style={{ fontFamily: font, fontWeight: 500, color: c.text }}>
          {s.manualOverride}
        </h3>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px]" style={{ fontFamily: font, color: c.text }}>{s.openValveFor}</span>
          <input
            type="number" value={overrideMin}
            onChange={(e) => setOverrideMin(Number(e.target.value))}
            className="w-16 h-9 rounded-lg text-center text-[13px] outline-none bg-transparent"
            style={{ border: `1px solid ${c.border}`, fontFamily: "JetBrains Mono", color: c.text }} dir="ltr"
          />
          <span className="text-[13px]" style={{ fontFamily: font, color: c.text }}>{s.min}</span>
          <button
            onClick={() =>
              irrigate.mutate(overrideMin, {
                onSuccess: () => toast.success(s.openValve, { duration: 3000 }),
                onError: (error) => reportError(error, "Could not open the valve."),
              })
            }
            disabled={irrigate.isPending}
            className="px-5 py-2 text-white rounded-full text-[13px] transition-colors disabled:opacity-60"
            style={{ background: c.green, fontFamily: font, fontWeight: 500 }}
          >
            {s.openValve}
          </button>
          <button
            onClick={() =>
              setValve.mutate(
                { action: "CLOSE" },
                {
                  onSuccess: () => toast.success(s.closeValveNow, { duration: 3000 }),
                  onError: (error) => reportError(error, "Could not close the valve."),
                },
              )
            }
            disabled={setValve.isPending}
            className="px-5 py-2 rounded-full text-[13px] transition-colors disabled:opacity-60"
            style={{ border: `1px solid ${c.border}`, color: c.text, fontFamily: font }}
          >
            {s.closeValveNow}
          </button>
        </div>
      </section>

      {/* ════════════════════════════════════════
          SECTION B — WORKER MANAGEMENT (Admin)
      ════════════════════════════════════════ */}
      {isAdmin && (
        <>
          <Divider />
          <section className="py-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[20px]" style={{ fontWeight: 500, fontFamily: font, color: c.text }}>
                {wt.sectionTitle}
              </h2>
              <button
                onClick={() => setShowInviteModal(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-white rounded-full text-[13px] transition-colors"
                style={{ background: c.green, fontFamily: font, fontWeight: 500 }}
              >
                <UserPlus size={14} strokeWidth={1.5} />
                {wt.inviteBtn}
              </button>
            </div>

            {/* Worker type legend */}
            <div className="flex flex-wrap gap-4 mb-5">
              {[
                {
                  icon: Shield, label: wt.operator,
                  desc: isRTL ? "يمكنه فتح/إغلاق الصمامات" : "Can operate valves",
                  color: isDark ? "#58A6FF" : "#0077B6",
                  bg: isDark ? "rgba(88,166,255,0.10)" : "#EFF6FF",
                },
                {
                  icon: Eye, label: wt.observer,
                  desc: isRTL ? "وصول للقراءة فقط" : "Read-only access",
                  color: isDark ? "#8B949E" : "#6B7280",
                  bg: isDark ? "#21262D" : "#F3F4F6",
                },
              ].map(({ icon: Icon, label, desc, color, bg }) => (
                <div key={label} className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px]" style={{ background: bg }}>
                  <Icon size={12} strokeWidth={1.5} style={{ color }} />
                  <span style={{ color, fontFamily: font, fontWeight: 500 }}>{label}</span>
                  <span style={{ fontFamily: font, color: c.sec }}>— {desc}</span>
                </div>
              ))}
            </div>

            {workers.length === 0 ? (
              <div className="border border-dashed rounded-lg p-10 text-center" style={{ borderColor: c.border }}>
                <User size={32} strokeWidth={1.5} className="mx-auto mb-3" style={{ color: c.sec }} />
                <p className="text-[13px] max-w-[400px] mx-auto" style={{ fontFamily: font, lineHeight: 1.6, color: c.sec }}>
                  {wt.emptyText}
                </p>
              </div>
            ) : (
              <div className="rounded-lg overflow-x-auto" style={{ border: `1px solid ${c.border}` }}>
                <table className="w-full min-w-[540px]">
                  <thead style={{ background: isDark ? "#0D1117" : "#FAFAFA", borderBottom: `1px solid ${c.border}` }}>
                    <tr>
                      {[wt.workerCol, wt.roleCol, wt.valveCol, wt.statusCol, ""].map((col, i) => (
                        <th
                          key={i}
                          className="px-4 py-3 text-start tracking-wider"
                          style={{ fontFamily: "JetBrains Mono", fontWeight: 400, textTransform: "uppercase", fontSize: 11, color: c.sec }}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {workers.map((worker, idx) => (
                      <tr
                        key={worker.id}
                        className="transition-colors"
                        style={{
                          borderTop: idx > 0 ? `1px solid ${c.border}` : undefined,
                        }}
                        onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = isDark ? "#1C2128" : "#FAFAFA"}
                        onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}
                      >
                        {/* Worker name + email */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] shrink-0"
                              style={{ background: c.avatarBg, color: isDark ? "#FFFFFF" : "#6B7280", fontFamily: "JetBrains Mono" }}
                            >
                              {worker.initials}
                            </div>
                            <div>
                              <p className="text-[13px]" style={{ fontFamily: font, fontWeight: 500, color: c.text }}>{worker.name}</p>
                              <p className="text-[11px]" style={{ fontFamily: "JetBrains Mono", color: c.sec }}>{worker.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Role badge */}
                        <td className="px-4 py-3">
                          <span
                            className="px-2.5 py-1 rounded-full text-[11px]"
                            style={{
                              fontFamily: font,
                              ...(worker.type === "operator"
                                ? { border: `1px solid ${isDark ? "#58A6FF" : "#0077B6"}`, color: isDark ? "#58A6FF" : "#0077B6", background: isDark ? "rgba(88,166,255,0.10)" : "#EFF6FF" }
                                : { background: isDark ? "#21262D" : "#F3F4F6", color: isDark ? "#8B949E" : "#6B7280" }),
                            }}
                          >
                            {worker.type === "operator" ? wt.operator : wt.observer}
                          </span>
                        </td>

                        {/* Valve control */}
                        <td className="px-4 py-3">
                          {worker.type === "operator" ? (
                            <PillToggle value={worker.valveControl} onChange={() => toggleValveControl(worker.id)} />
                          ) : (
                            <span className="text-[13px]" style={{ fontFamily: "JetBrains Mono", color: c.sec }}>—</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <span
                            className="text-[11px] tracking-wider"
                            style={{
                              fontFamily: "JetBrains Mono",
                              textTransform: "uppercase",
                              color: worker.status === "active" ? c.green : c.sec,
                            }}
                          >
                            {worker.status === "active" ? wt.active : wt.invited}
                          </span>
                        </td>

                        {/* Actions menu */}
                        <td className="px-4 py-3 relative">
                          <button
                            onClick={() => setOpenMenuId(openMenuId === worker.id ? null : worker.id)}
                            className="w-7 h-7 flex items-center justify-center rounded-full transition-colors"
                            style={{ color: c.sec }}
                          >
                            <MoreHorizontal size={16} strokeWidth={1.5} />
                          </button>

                          {openMenuId === worker.id && (
                            <div
                              className={`absolute ${isRTL ? "left-0" : "right-0"} top-full mt-1 rounded-lg shadow-sm z-20 overflow-hidden`}
                              style={{ minWidth: 172, background: c.card, border: `1px solid ${c.border}` }}
                            >
                              {[
                                { label: wt.editBtn, danger: false, action: () => setOpenMenuId(null) },
                                { label: wt.resetPwd, danger: false, action: () => resetWorkerPwd(worker.id) },
                                { label: wt.removeBtn, danger: true, action: () => removeWorker(worker.id) },
                              ].map((item) => (
                                <button
                                  key={item.label}
                                  onClick={item.action}
                                  className="w-full text-start px-4 py-2.5 text-[13px] transition-colors"
                                  style={{ fontFamily: font, color: item.danger ? (isDark ? "#F85149" : "#EF4444") : c.text }}
                                  onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.background = isDark ? "#1C2128" : "#FAFAFA"}
                                  onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.background = "transparent"}
                                >
                                  {item.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <Divider />

          {/* ════════════════════════════════════════
              WEBSITE ENQUIRIES (leads)
          ════════════════════════════════════════ */}
          <section className="py-6">
            <h2
              className="text-[20px] mb-2"
              style={{ fontWeight: 500, fontFamily: font, color: c.text }}
            >
              {sl.sectionTitle}
            </h2>
            <p
              className="text-[12px] mb-5 max-w-[520px]"
              style={{ fontFamily: font, color: c.sec, lineHeight: 1.6 }}
            >
              {sl.hint}
            </p>

            {leads.isError && (
              <p className="text-[13px] mb-4" style={{ fontFamily: font, color: c.crit }}>
                {leads.error instanceof Error ? leads.error.message : "Could not load enquiries."}
              </p>
            )}

            {(leads.data?.data.length ?? 0) === 0 ? (
              <div
                className="border border-dashed rounded-lg p-10 text-center"
                style={{ borderColor: c.border }}
              >
                <p className="text-[13px]" style={{ fontFamily: font, color: c.sec }}>
                  {leads.isLoading ? "…" : sl.empty}
                </p>
              </div>
            ) : (
              <div className="rounded-lg overflow-x-auto" style={{ border: `1px solid ${c.border}` }}>
                <table className="w-full min-w-[560px]">
                  <thead style={{ background: c.thead, borderBottom: `1px solid ${c.border}` }}>
                    <tr>
                      {[sl.contactCol, sl.areaCol, sl.dateCol, sl.statusCol].map((col) => (
                        <th
                          key={col}
                          className="px-4 py-3 text-start tracking-wider"
                          style={{
                            fontFamily: "JetBrains Mono",
                            fontWeight: 400,
                            textTransform: "uppercase",
                            fontSize: 11,
                            color: c.sec,
                          }}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(leads.data?.data ?? []).map((lead, idx) => (
                      <tr
                        key={lead.id}
                        style={{ borderTop: idx > 0 ? `1px solid ${c.border}` : undefined }}
                      >
                        <td className="px-4 py-3">
                          <p
                            className="text-[13px]"
                            style={{ fontFamily: font, fontWeight: 500, color: c.text }}
                          >
                            {lead.name}
                          </p>
                          <p className="text-[11px]" style={{ fontFamily: "JetBrains Mono", color: c.sec }}>
                            {lead.email}
                            {lead.phone ? ` · ${lead.phone}` : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3" style={{ fontFamily: "JetBrains Mono", color: c.sec }}>
                          {lead.landArea ?? "—"}
                        </td>
                        <td className="px-4 py-3" style={{ fontFamily: "JetBrains Mono", color: c.sec }}>
                          {farmDateLabel(new Date(lead.createdAt), lang)}
                        </td>
                        <td className="px-4 py-3">
                          {/*
                            A select rather than a button, because a lead has three states and the
                            owner works through them at their own pace. There is no email delivery in
                            this project, so this list is the only place an enquiry surfaces.
                          */}
                          <select
                            value={lead.status}
                            onChange={(e) =>
                              updateLead.mutate(
                                { id: lead.id, input: { status: e.target.value as "NEW" | "CONTACTED" | "CLOSED" } },
                                { onError: (error) => reportError(error, "Could not update that lead.") },
                              )
                            }
                            className="rounded-lg px-2 py-1.5 text-[12px] outline-none"
                            style={{
                              border: `1px solid ${c.border}`,
                              background: c.formBg,
                              color: lead.status === "NEW" ? c.green : c.text,
                              fontFamily: font,
                            }}
                          >
                            <option value="NEW">{sl.statusNew}</option>
                            <option value="CONTACTED">{sl.statusContacted}</option>
                            <option value="CLOSED">{sl.statusClosed}</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* ════════════════════════════════════════
          INVITE WORKER MODAL
      ════════════════════════════════════════ */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div
            className="rounded-lg w-full p-8 relative"
            style={{ maxWidth: 440, background: c.card, border: `1px solid ${c.border}` }}
          >
            {/* Close */}
            <button
              onClick={() => setShowInviteModal(false)}
              className="absolute top-4 transition-colors"
              style={{ [isRTL ? "left" : "right"]: 16, color: c.sec }}
            >
              <X size={18} strokeWidth={1.5} />
            </button>

            <h3 className="text-[18px] mb-6" style={{ fontFamily: font, fontWeight: 500, color: c.text }}>
              {wt.inviteTitle}
            </h3>

            <div className="flex flex-col gap-6">
              {/* Name */}
              <div>
                <FieldLabel isRTL={isRTL} font={font}>{wt.inviteNameLabel}</FieldLabel>
                <MinInput value={inviteForm.name} onChange={(v) => setInviteForm((f) => ({ ...f, name: v }))} placeholder="e.g. Youssef Mansouri" font={font} />
              </div>

              {/* Email */}
              <div>
                <FieldLabel isRTL={isRTL} font={font}>{wt.inviteEmailLabel}</FieldLabel>
                <MinInput value={inviteForm.email} onChange={(v) => setInviteForm((f) => ({ ...f, email: v }))} type="email" placeholder="worker@ferme.dz" font={font} dir="ltr" />
              </div>

              {/* Worker type */}
              <div>
                <FieldLabel isRTL={isRTL} font={font}>{wt.inviteTypeLabel}</FieldLabel>
                <div className="flex gap-3 mt-2">
                  {(["operator", "observer"] as WorkerType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => setInviteForm((f) => ({ ...f, type, grantValve: false }))}
                      className="flex-1 py-2.5 rounded-full text-[13px] transition-colors"
                      style={{
                        fontFamily: font,
                        border: `1px solid ${inviteForm.type === type ? c.green : c.border}`,
                        color: inviteForm.type === type ? c.green : c.sec,
                        background: inviteForm.type === type ? c.iconBg : "transparent",
                      }}
                    >
                      {type === "operator" ? wt.operator : wt.observer}
                    </button>
                  ))}
                </div>
              </div>

              {/* Valve permission (operator only) */}
              {inviteForm.type === "operator" && (
                <label
                  className="flex items-start gap-3 p-4 rounded-lg cursor-pointer"
                  style={{ background: c.formBg, border: `1px solid ${c.border}` }}
                >
                  <input
                    type="checkbox"
                    checked={inviteForm.grantValve}
                    onChange={(e) => setInviteForm((f) => ({ ...f, grantValve: e.target.checked }))}
                    className="mt-0.5 shrink-0"
                    style={{ accentColor: c.green }}
                  />
                  <span className="text-[13px]" style={{ fontFamily: font, lineHeight: 1.5, color: c.text }}>
                    {wt.inviteValveLabel}
                  </span>
                </label>
              )}

              {/* Buttons */}
              <div className="flex gap-3 mt-1">
                <button
                  onClick={sendInvite}
                  className="flex-1 py-3 text-white rounded-full text-[14px] transition-colors"
                  style={{ background: c.green, fontFamily: font, fontWeight: 500 }}
                >
                  {wt.sendBtn}
                </button>
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="px-6 py-3 rounded-full text-[14px] transition-colors"
                  style={{ border: `1px solid ${c.border}`, color: c.text, fontFamily: font }}
                >
                  {wt.cancelBtn}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Click-outside overlay to close dropdown menus */}
      {openMenuId && (
        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
      )}
    </div>
  );
}