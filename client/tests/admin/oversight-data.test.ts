import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  setFarmStatusSchema,
  setUserStatusSchema,
  type AdminUser,
  type AuthUser,
} from "@semico/shared";
import { adminApi } from "../../src/api/admin";
import { queryKeys } from "../../src/api/queryKeys";
import {
  useAdminFarms,
  useAdminUsers,
  useSetFarmStatus,
  useSetUserStatus,
} from "../../src/features/admin/useAdminOversight";
import {
  canChangeUserStatus,
  nextFarmStatus,
  nextUserStatus,
} from "../../src/features/admin/oversightActions";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  invalidateQueries: vi.fn(),
  api: {
    get: vi.fn(),
    getPage: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));
vi.mock("../../src/features/auth/AuthContext", () => ({
  useAuth: mocks.useAuth,
}));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: mocks.useQuery,
  useMutation: mocks.useMutation,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock("../../src/lib/api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/api/http")>()),
  api: mocks.api,
}));

const admin: AuthUser = {
  id: "admin",
  email: "admin@test.dz",
  fullName: "Admin",
  initials: "AD",
  role: "SUPER_ADMIN",
  status: "ACTIVE",
  workerType: null,
  valveControl: false,
  farmId: null,
  farmName: null,
  avatarUrl: null,
  phone: null,
  wilayaId: null,
  commune: null,
  bio: null,
};
const user: AdminUser = {
  id: "worker",
  fullName: "Worker",
  email: "worker@test.dz",
  role: "WORKER",
  workerType: "OPERATOR",
  status: "ACTIVE",
  platformDisabled: false,
  createdAt: "2026-11-03T12:00:00.000Z",
  farm: null,
  ownedFarms: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useAuth.mockReturnValue({ user: admin, status: "authenticated" });
  mocks.invalidateQueries.mockResolvedValue(undefined);
  for (const method of Object.values(mocks.api)) method.mockResolvedValue({});
});

describe("oversight status contracts and safety", () => {
  it("accepts only each resource's allowed status values", () => {
    expect(setFarmStatusSchema.parse({ status: "SUSPENDED" })).toEqual({
      status: "SUSPENDED",
    });
    expect(setFarmStatusSchema.safeParse({ status: "DISABLED" }).success).toBe(
      false,
    );
    expect(setUserStatusSchema.parse({ status: "DISABLED" })).toEqual({
      status: "DISABLED",
    });
    expect(setUserStatusSchema.safeParse({ status: "INVITED" }).success).toBe(
      false,
    );
    expect(
      setUserStatusSchema.safeParse({ status: "ACTIVE", role: "SUPER_ADMIN" })
        .success,
    ).toBe(false);
  });
  it("computes explicit farm suspension and resumption actions", () => {
    expect(nextFarmStatus("ACTIVE")).toBe("SUSPENDED");
    expect(nextFarmStatus("SUSPENDED")).toBe("ACTIVE");
  });
  it("computes account actions including platform locks and pending invitations", () => {
    expect(nextUserStatus(user)).toBe("DISABLED");
    expect(nextUserStatus({ ...user, platformDisabled: true })).toBe("ACTIVE");
    expect(nextUserStatus({ ...user, status: "DISABLED" })).toBe("ACTIVE");
    expect(nextUserStatus({ ...user, status: "INVITED" })).toBe("ACTIVE");
  });
  it("blocks self-disabling and actions without an authenticated actor", () => {
    expect(canChangeUserStatus(user.id, user)).toBe(false);
    expect(canChangeUserStatus(admin.id, user)).toBe(true);
    expect(canChangeUserStatus(undefined, user)).toBe(false);
  });
});

describe("private oversight APIs and queries", () => {
  it("uses paginated endpoints and safely encodes IDs for status updates", async () => {
    await adminApi.farms(2);
    await adminApi.users(3);
    expect(mocks.api.getPage).toHaveBeenCalledWith("/admin/farms?page=2");
    expect(mocks.api.getPage).toHaveBeenCalledWith("/admin/users?page=3");
    await adminApi.setFarmStatus("farm/a", { status: "SUSPENDED" });
    await adminApi.setUserStatus("user/a", { status: "DISABLED" });
    expect(mocks.api.patch).toHaveBeenCalledWith(
      "/admin/farms/farm%2Fa/status",
      { status: "SUSPENDED" },
    );
    expect(mocks.api.patch).toHaveBeenCalledWith(
      "/admin/users/user%2Fa/status",
      { status: "DISABLED" },
    );
  });
  it("keys private caches by account and page and discards them after unmount", async () => {
    useAdminFarms(2);
    useAdminUsers(3);
    const [farms, users] = mocks.useQuery.mock.calls.map(
      ([options]) => options,
    );
    expect(farms).toMatchObject({
      queryKey: queryKeys.admin.farms(admin.id, 2),
      enabled: true,
      gcTime: 0,
    });
    expect(users).toMatchObject({
      queryKey: queryKeys.admin.users(admin.id, 3),
      enabled: true,
      gcTime: 0,
    });
    await farms.queryFn();
    await users.queryFn();
    expect(mocks.api.getPage).toHaveBeenCalledWith("/admin/farms?page=2");
    expect(queryKeys.admin.users("other-admin", 3)).not.toEqual(
      queryKeys.admin.users(admin.id, 3),
    );
  });
  it.each(["OWNER", "WORKER"] as const)(
    "does not fetch platform lists for %s",
    (role) => {
      mocks.useAuth.mockReturnValue({
        user: { ...admin, role },
        status: "authenticated",
      });
      useAdminFarms(1);
      useAdminUsers(1);
      for (const [options] of mocks.useQuery.mock.calls)
        expect(options.enabled).toBe(false);
    },
  );
  it.each(["DISABLED", "INVITED"] as const)(
    "does not fetch platform lists for a %s admin",
    (status) => {
      mocks.useAuth.mockReturnValue({
        user: { ...admin, status },
        status: "authenticated",
      });
      useAdminFarms(1);
      useAdminUsers(1);
      for (const [options] of mocks.useQuery.mock.calls)
        expect(options.enabled).toBe(false);
    },
  );
  it("does not fetch private lists while restoring a session", () => {
    mocks.useAuth.mockReturnValue({ user: null, status: "loading" });
    useAdminFarms(1);
    useAdminUsers(1);
    for (const [options] of mocks.useQuery.mock.calls)
      expect(options.enabled).toBe(false);
  });
});

describe("oversight status changes synchronize cached access", () => {
  it("refreshes farm lists and tenant queries after suspending a farm", async () => {
    useSetFarmStatus();
    const options = mocks.useMutation.mock.calls[0]![0];
    await options.mutationFn({ id: "farm", input: { status: "SUSPENDED" } });
    await options.onSuccess();
    expect(mocks.api.patch).toHaveBeenCalledWith("/admin/farms/farm/status", {
      status: "SUSPENDED",
    });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.admin.all,
    });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.farm.all,
    });
  });
  it("refreshes platform, session, and worker queries after an account change", async () => {
    useSetUserStatus();
    const options = mocks.useMutation.mock.calls[0]![0];
    await options.mutationFn({ id: user.id, input: { status: "DISABLED" } });
    await options.onSuccess();
    expect(mocks.api.patch).toHaveBeenCalledWith("/admin/users/worker/status", {
      status: "DISABLED",
    });
    for (const queryKey of [
      queryKeys.admin.all,
      queryKeys.me,
      queryKeys.workers.all,
    ])
      expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey });
  });
});
