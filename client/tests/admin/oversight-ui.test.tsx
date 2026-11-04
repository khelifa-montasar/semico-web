import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AdminFarm, AdminUser } from "@semico/shared";
import { translations } from "../../src/app/i18n/translations";
import { AdminFarms } from "../../src/app/components/pages/AdminFarms";
import { AdminUsers } from "../../src/app/components/pages/AdminUsers";
import { readSource } from "../helpers/source";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useLanguage: vi.fn(),
  useAdminFarms: vi.fn(),
  useAdminUsers: vi.fn(),
  useSetFarmStatus: vi.fn(),
  useSetUserStatus: vi.fn(),
  confirm: vi.fn(),
  buttons: [] as Array<{
    label: string;
    disabled: boolean;
    onClick?: () => void;
  }>,
}));
vi.mock("../../src/features/auth/AuthContext", () => ({
  useAuth: mocks.useAuth,
}));
vi.mock("../../src/app/contexts/LanguageContext", () => ({
  useLanguage: mocks.useLanguage,
}));
vi.mock("../../src/features/admin/useAdminOversight", () => ({
  useAdminFarms: mocks.useAdminFarms,
  useAdminUsers: mocks.useAdminUsers,
  useSetFarmStatus: mocks.useSetFarmStatus,
  useSetUserStatus: mocks.useSetUserStatus,
}));
vi.mock("../../src/features/admin/CmsControls", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("../../src/features/admin/CmsControls")
    >();
  return {
    ...original,
    CmsButton: (props: Parameters<typeof original.CmsButton>[0]) => {
      mocks.buttons.push({
        label: String(props.children),
        disabled: Boolean(props.disabled),
        onClick: props.onClick as (() => void) | undefined,
      });
      return <original.CmsButton {...props} />;
    },
  };
});

const farm: AdminFarm = {
  id: "farm-a",
  name: "North Farm",
  status: "ACTIVE",
  workerCount: 3,
  createdAt: "2026-11-03T12:00:00.000Z",
  owner: { id: "owner", fullName: "Farm Owner", email: "owner@test.dz" },
};
const ownAccount: AdminUser = {
  id: "admin",
  fullName: "Platform Admin",
  email: "admin@test.dz",
  role: "SUPER_ADMIN",
  workerType: null,
  status: "ACTIVE",
  platformDisabled: false,
  createdAt: "2026-11-03T12:00:00.000Z",
  farm: null,
  ownedFarms: [],
};
const worker: AdminUser = {
  ...ownAccount,
  id: "worker",
  fullName: "Active Worker",
  email: "worker@test.dz",
  role: "WORKER",
  workerType: "OPERATOR",
  farm: { id: farm.id, name: farm.name },
};
const blocked: AdminUser = {
  ...ownAccount,
  id: "blocked",
  fullName: "Blocked Owner",
  email: "blocked@test.dz",
  role: "OWNER",
  status: "DISABLED",
  platformDisabled: true,
  ownedFarms: [{ id: farm.id, name: farm.name }],
};
const meta = { page: 1, pageSize: 20, total: 2, totalPages: 1 };
const farmChange = {
  mutate: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  isError: false,
  isSuccess: false,
};
const userChange = {
  mutate: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  isError: false,
  isSuccess: false,
};

function language(lang: "en" | "ar") {
  mocks.useLanguage.mockReturnValue({
    lang,
    t: translations[lang],
    isRTL: lang === "ar",
    font: "sans-serif",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.buttons.length = 0;
  language("en");
  mocks.useAuth.mockReturnValue({ user: ownAccount, status: "authenticated" });
  mocks.confirm.mockReturnValue(true);
  vi.stubGlobal("window", { confirm: mocks.confirm });
  mocks.useAdminFarms.mockReturnValue({
    data: {
      data: [
        farm,
        { ...farm, id: "farm-b", name: "Suspended Farm", status: "SUSPENDED" },
      ],
      meta,
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  mocks.useAdminUsers.mockReturnValue({
    data: {
      data: [
        ownAccount,
        worker,
        blocked,
        {
          ...worker,
          id: "invited",
          fullName: "Invited Worker",
          status: "INVITED",
          workerType: "ENGINEER",
        },
      ],
      meta,
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
  mocks.useSetFarmStatus.mockReturnValue({ ...farmChange });
  mocks.useSetUserStatus.mockReturnValue({ ...userChange });
});
afterEach(() => vi.unstubAllGlobals());

describe("farm oversight table", () => {
  it("shows owner details, active and suspended farms, and status actions", () => {
    const html = renderToStaticMarkup(<AdminFarms />);
    for (const text of [
      farm.name,
      farm.owner.fullName,
      farm.owner.email,
      "Suspended Farm",
      "Active",
      "Suspended",
      "Suspend",
      "Resume",
      "Workers",
    ])
      expect(html).toContain(text);
    expect(html).toContain('aria-label="Farms"');
  });
  it("confirms before submitting explicit suspension and resumption statuses", () => {
    renderToStaticMarkup(<AdminFarms />);
    mocks.buttons.find((button) => button.label === "Suspend")!.onClick!();
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.stringContaining(farm.name),
    );
    expect(farmChange.mutate).toHaveBeenCalledWith({
      id: farm.id,
      input: { status: "SUSPENDED" },
    });
    mocks.buttons.find((button) => button.label === "Resume")!.onClick!();
    expect(farmChange.mutate).toHaveBeenCalledWith({
      id: "farm-b",
      input: { status: "ACTIVE" },
    });
  });
  it("does not change a farm when confirmation is cancelled", () => {
    mocks.confirm.mockReturnValue(false);
    renderToStaticMarkup(<AdminFarms />);
    mocks.buttons.find((button) => button.label === "Suspend")!.onClick!();
    expect(farmChange.mutate).not.toHaveBeenCalled();
  });
  it("hides cached farm and owner details after a request error", () => {
    mocks.useAdminFarms.mockReturnValue({
      data: { data: [farm], meta },
      isError: true,
      refetch: vi.fn(),
    });
    const html = renderToStaticMarkup(<AdminFarms />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Try again");
    expect(html).not.toContain(farm.owner.email);
  });
  it("distinguishes loading and empty farm lists", () => {
    mocks.useAdminFarms.mockReturnValue({ isPending: true, refetch: vi.fn() });
    expect(renderToStaticMarkup(<AdminFarms />)).toContain('role="status"');
    mocks.useAdminFarms.mockReturnValue({
      data: { data: [], meta },
      refetch: vi.fn(),
    });
    expect(renderToStaticMarkup(<AdminFarms />)).toContain("No farms yet.");
  });
});

describe("user oversight table", () => {
  it("shows all roles, statuses, worker types, farm associations, and account actions", () => {
    const html = renderToStaticMarkup(<AdminUsers />);
    for (const text of [
      ownAccount.email,
      worker.email,
      blocked.email,
      "Super admin",
      "Farm owner",
      "Worker",
      "Operator",
      "Engineer",
      "Invited",
      "Disabled by platform",
      farm.name,
      "Enable",
      "Disable",
    ])
      expect(html).toContain(text);
    expect(html).toContain('aria-label="Users"');
  });
  it("disables the current administrator's own disable button", () => {
    const html = renderToStaticMarkup(<AdminUsers />);
    expect(html).toContain(
      "You cannot disable your own administrator account.",
    );
    expect(html).toContain("Your account");
    const protectedButton = mocks.buttons.find(
      (button) => button.label === "Disable" && button.disabled,
    )!;
    protectedButton.onClick!();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(userChange.mutate).not.toHaveBeenCalled();
  });
  it("confirms account disable and enable requests without sending role changes", () => {
    renderToStaticMarkup(<AdminUsers />);
    mocks.buttons.find(
      (button) => button.label === "Disable" && !button.disabled,
    )!.onClick!();
    expect(userChange.mutate).toHaveBeenCalledWith({
      id: worker.id,
      input: { status: "DISABLED" },
    });
    mocks.buttons.find((button) => button.label === "Enable")!.onClick!();
    expect(userChange.mutate).toHaveBeenCalledWith({
      id: blocked.id,
      input: { status: "ACTIVE" },
    });
  });
  it("does not update accounts after a cancelled confirmation", () => {
    mocks.confirm.mockReturnValue(false);
    renderToStaticMarkup(<AdminUsers />);
    mocks.buttons.find((button) => button.label === "Enable")!.onClick!();
    expect(userChange.mutate).not.toHaveBeenCalled();
  });
  it("hides private users after a list request fails", () => {
    mocks.useAdminUsers.mockReturnValue({
      data: { data: [blocked], meta },
      isError: true,
      refetch: vi.fn(),
    });
    const html = renderToStaticMarkup(<AdminUsers />);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain(blocked.email);
  });
});

describe("oversight UI state and routing", () => {
  it("disables actions while a status update is pending", () => {
    mocks.useSetFarmStatus.mockReturnValue({ ...farmChange, isPending: true });
    renderToStaticMarkup(<AdminFarms />);
    expect(mocks.buttons.every((button) => button.disabled)).toBe(true);
  });
  it("reports failed status updates without claiming success", () => {
    mocks.useSetUserStatus.mockReturnValue({ ...userChange, isError: true });
    const html = renderToStaticMarkup(<AdminUsers />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Unable to change status");
    expect(html).not.toContain("Status updated.");
  });
  it("renders Arabic labels for both tables", () => {
    language("ar");
    expect(renderToStaticMarkup(<AdminFarms />)).toContain(
      translations.ar.admin.oversight.suspend,
    );
    expect(renderToStaticMarkup(<AdminUsers />)).toContain(
      translations.ar.admin.oversight.platformLock,
    );
  });
  it("supports pagination and keeps both screens within the lazy protected admin route tree", () => {
    mocks.useAdminFarms.mockReturnValue({
      data: { data: [farm], meta: { ...meta, page: 2, totalPages: 3 } },
      refetch: vi.fn(),
    });
    expect(renderToStaticMarkup(<AdminFarms />)).toContain("Page 2 of 3");
    const routes = readSource("src/app/routes.tsx").text;
    for (const page of ["AdminFarms", "AdminUsers"])
      expect(routes).toContain(`import("./components/pages/${page}")`);
    expect(routes).toContain('{ path: "farms", Component: AdminFarms }');
    expect(routes).toContain('{ path: "users", Component: AdminUsers }');
    const layout = readSource("src/app/components/AdminLayout.tsx").text;
    expect(layout).toContain('to: "/admin/farms"');
    expect(layout).toContain('to: "/admin/users"');
  });
});
