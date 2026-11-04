import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AuthUser, PlatformStats } from "@semico/shared";
import type { AuthContextValue } from "../../src/features/auth/AuthContext";
import { RequireSuperAdmin } from "../../src/features/auth/RequireSuperAdmin";
import { RequireAuth } from "../../src/features/auth/RequireAuth";
import { getPostLoginDestination } from "../../src/features/auth/navigation";
import { canAccessAdmin } from "../../src/features/auth/permissions";
import { AdminLayout } from "../../src/app/components/AdminLayout";
import { AdminDashboard } from "../../src/app/components/pages/AdminDashboard";

const mocks = vi.hoisted(() => ({ useAuth: vi.fn(), useAdminStats: vi.fn() }));
vi.mock("../../src/features/auth/AuthContext", () => ({ useAuth: mocks.useAuth }));
vi.mock("../../src/features/admin/useAdminStats", () => ({ useAdminStats: mocks.useAdminStats }));
vi.mock("react-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-router")>(),
  // SSR does not execute Navigate's browser effect; capture the destination it requests.
  Navigate: ({ to }: { to: string }) => <span data-redirect={to} />,
}));

const admin: AuthUser = {
  id: "admin", email: "admin@test.dz", fullName: "Platform Admin", role: "SUPER_ADMIN",
  status: "ACTIVE", workerType: null, valveControl: false, farmId: null, farmName: null,
  avatarUrl: null, phone: null, wilayaId: null, commune: null, bio: null, initials: "PA",
};
const stats: PlatformStats = {
  totalFarms: 6, totalUsers: 15, totalActiveMqttDevices: 3, mqttActivityWindowSeconds: 120,
  recentFarms: Array.from({ length: 5 }, (_, index) => ({
    id: `farm-${index}`, name: `Farm ${index}`, createdAt: "2026-11-03T12:00:00.000Z",
    owner: { id: `owner-${index}`, fullName: `Owner ${index}`, email: `owner-${index}@test.dz` },
  })),
};

function session(user: AuthUser | null, status: AuthContextValue["status"] = "authenticated") {
  mocks.useAuth.mockReturnValue({ user, status, logout: vi.fn().mockResolvedValue(undefined) });
}

beforeEach(() => {
  session(admin);
  mocks.useAdminStats.mockReturnValue({
    data: stats, isPending: false, isError: false, isFetching: false,
    refetch: vi.fn(), dataUpdatedAt: Date.parse("2026-11-03T12:00:00Z"),
  });
});

function renderGuard(Guard: typeof RequireSuperAdmin) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={["/protected"]}>
    <Routes><Route path="/protected" element={<Guard />}>
      <Route index element={<p>Protected content</p>} />
    </Route></Routes>
  </MemoryRouter>);
}

describe("admin access and login destination", () => {
  it("renders the protected subtree for an active super admin", () => {
    expect(renderGuard(RequireSuperAdmin)).toContain("Protected content");
  });

  it.each(["OWNER", "WORKER"] as const)("redirects %s to the farm dashboard", (role) => {
    session({ ...admin, role });
    const html = renderGuard(RequireSuperAdmin);
    expect(html).toContain('data-redirect="/dashboard"');
    expect(html).not.toContain("Protected content");
  });

  it.each(["DISABLED", "INVITED"] as const)("refuses a %s super admin", (status) => {
    session({ ...admin, status });
    expect(canAccessAdmin({ ...admin, status })).toBe(false);
    expect(renderGuard(RequireSuperAdmin)).toContain('data-redirect="/dashboard"');
  });

  it("redirects anonymous users to dashboard and waits for session restoration", () => {
    session(null, "anonymous");
    expect(renderGuard(RequireSuperAdmin)).toContain('data-redirect="/dashboard"');
    session(null, "loading");
    const html = renderGuard(RequireSuperAdmin);
    expect(html).toContain('role="status"');
    expect(html).not.toContain("Protected content");
    expect(html).not.toContain("data-redirect");
  });

  it("sends super admins away from the farm dashboard without looping on inactive accounts", () => {
    expect(renderGuard(RequireAuth)).toContain('data-redirect="/admin/dashboard"');
    session({ ...admin, status: "INVITED" });
    expect(renderGuard(RequireAuth)).not.toContain('data-redirect="/admin/dashboard"');
  });

  it("keeps login destinations inside the account's portal", () => {
    expect(getPostLoginDestination("SUPER_ADMIN")).toBe("/admin/dashboard");
    expect(getPostLoginDestination("SUPER_ADMIN", "/dashboard/settings")).toBe("/admin/dashboard");
    expect(getPostLoginDestination("SUPER_ADMIN", "/admin/dashboard")).toBe("/admin/dashboard");
    expect(getPostLoginDestination("OWNER", "/dashboard/settings")).toBe("/dashboard/settings");
    expect(getPostLoginDestination("WORKER", "/admin/dashboard")).toBe("/dashboard");
    expect(getPostLoginDestination("OWNER", "https://example.com")).toBe("/dashboard");
  });
});

describe("admin dashboard", () => {
  it("shows all three statistics and the five recent signups with owner details", () => {
    const html = renderToStaticMarkup(<AdminDashboard />);
    expect(html).toContain("Total farms");
    expect(html).toContain("Total users");
    expect(html).toContain("Total active MQTT devices");
    for (const number of [6, 15, 3]) expect(html).toContain(`<bdi>${number}</bdi>`);
    for (const farm of stats.recentFarms) {
      expect(html).toContain(farm.name);
      expect(html).toContain(farm.owner.fullName);
      expect(html).toContain(farm.owner.email);
    }
    expect((html.match(/<tr /g) ?? []).length).toBe(5);
    expect(html).toContain("Refresh");
    expect(html).toContain("Last updated");
  });

  it("shows real zeros and an empty signup state", () => {
    mocks.useAdminStats.mockReturnValue({ data: { ...stats, totalFarms: 0, totalUsers: 0, totalActiveMqttDevices: 0, recentFarms: [] } });
    const html = renderToStaticMarkup(<AdminDashboard />);
    expect((html.match(/<bdi>0<\/bdi>/g) ?? []).length).toBe(3);
    expect(html).toContain("No farms have signed up yet.");
  });

  it("does not display empty or zero values while loading", () => {
    mocks.useAdminStats.mockReturnValue({ isPending: true, isFetching: true });
    const html = renderToStaticMarkup(<AdminDashboard />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading platform statistics");
    expect(html).not.toContain("No farms have signed up yet.");
    expect(html).not.toContain("<bdi>0</bdi>");
  });

  it("offers a retry and hides stale platform data after an error", () => {
    mocks.useAdminStats.mockReturnValue({ isError: true, data: stats });
    const html = renderToStaticMarkup(<AdminDashboard />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Try again");
    expect(html).not.toContain("Farm 0");
    expect(html).not.toContain("<bdi>15</bdi>");
  });

  it("renders separate admin navigation without farm tools", () => {
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/admin/dashboard"]}>
        <Routes><Route path="/admin" element={<AdminLayout />}>
          <Route path="dashboard" element={<Outlet />} />
        </Route></Routes>
      </MemoryRouter>
    </QueryClientProvider>);
    expect(html).toContain("Admin portal");
    expect(html).toContain('href="/admin/dashboard"');
    expect(html).toContain("Log out");
    expect(html).not.toContain('href="/dashboard/system-health"');
    expect(html).not.toContain('href="/dashboard/settings"');
  });
});
