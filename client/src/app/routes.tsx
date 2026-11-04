import { lazy } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { PublicLayout } from "./components/PublicLayout";
import { DashboardLayout } from "./components/DashboardLayout";
import { AdminLayout } from "./components/AdminLayout";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { RequireDiagnosticsRoute } from "@/features/auth/RequireDiagnosticsRoute";
import { RequireSuperAdmin } from "@/features/auth/RequireSuperAdmin";

/**
 * Routes.
 *
 * Every page is loaded lazily, which is what keeps the public marketing site from shipping the
 * dashboard's code. Before this, a visitor reading the blog downloaded the whole authenticated
 * application — TanStack Query, the API layer and all five dashboard screens — as one 515 kB
 * bundle.
 *
 * The Suspense boundaries live inside each layout (see PublicLayout / DashboardLayout) rather than
 * around the router, so a slow route swaps only the content area and the navbar or sidebar stays
 * put instead of the whole page going blank.
 *
 * Pages are named exports, hence the `.then()` reshape into the `{ default }` shape `lazy` wants.
 */

const Home = lazy(() => import("./components/pages/Home").then((m) => ({ default: m.Home })));
const Services = lazy(() =>
  import("./components/pages/Services").then((m) => ({ default: m.Services })),
);
const Products = lazy(() =>
  import("./components/pages/Products").then((m) => ({ default: m.Products })),
);
const Blog = lazy(() => import("./components/pages/Blog").then((m) => ({ default: m.Blog })));
const About = lazy(() => import("./components/pages/About").then((m) => ({ default: m.About })));
const Login = lazy(() => import("./components/pages/Login").then((m) => ({ default: m.Login })));

const Dashboard = lazy(() =>
  import("./components/pages/Dashboard").then((m) => ({ default: m.Dashboard })),
);
const AdminDashboard = lazy(() =>
  import("./components/pages/AdminDashboard").then((m) => ({ default: m.AdminDashboard })),
);
const AdminPricing = lazy(() =>
  import("./components/pages/AdminPricing").then((module) => ({ default: module.AdminPricing })),
);
const AdminBlog = lazy(() =>
  import("./components/pages/AdminBlog").then((module) => ({ default: module.AdminBlog })),
);
const AdminFarms = lazy(() =>
  import("./components/pages/AdminFarms").then((module) => ({ default: module.AdminFarms })),
);
const AdminUsers = lazy(() =>
  import("./components/pages/AdminUsers").then((module) => ({ default: module.AdminUsers })),
);
const SystemHealth = lazy(() =>
  import("./components/pages/SystemHealth").then((m) => ({ default: m.SystemHealth })),
);
const Activity = lazy(() =>
  import("./components/pages/Activity").then((m) => ({ default: m.Activity })),
);
const Analytics = lazy(() =>
  import("./components/pages/Analytics").then((m) => ({ default: m.Analytics })),
);
const Settings = lazy(() =>
  import("./components/pages/Settings").then((m) => ({ default: m.Settings })),
);
const TechnicalDiagnostics = lazy(() =>
  import("./components/pages/TechnicalDiagnostics").then((m) => ({ default: m.TechnicalDiagnostics })),
);

export const router = createBrowserRouter([
  {
    path: "/admin",
    Component: RequireSuperAdmin,
    children: [{
      Component: AdminLayout,
      children: [
        { index: true, element: <Navigate to="/admin/dashboard" replace /> },
        { path: "dashboard", Component: AdminDashboard },
        { path: "pricing", Component: AdminPricing },
        { path: "blog", Component: AdminBlog },
        { path: "farms", Component: AdminFarms },
        { path: "users", Component: AdminUsers },
        { path: "*", element: <Navigate to="/admin/dashboard" replace /> },
      ],
    }],
  },
  {
    path: "/",
    Component: PublicLayout,
    children: [
      { index: true, Component: Home },
      { path: "services", Component: Services },
      { path: "products", Component: Products },
      { path: "blog", Component: Blog },
      { path: "about", Component: About },
      { path: "login", Component: Login },
    ],
  },
  {
    path: "/dashboard",
    Component: RequireAuth,
    children: [
      {
        Component: DashboardLayout,
        children: [
          { index: true, Component: Dashboard },
          { path: "system-health", Component: SystemHealth },
          { path: "activity", Component: Activity },
          { path: "analytics", Component: Analytics },
          { path: "settings", Component: Settings },
          {
            // Owner and engineer. The guard is a ROUTE (not the link visibility), so an operator
            // who types the URL is redirected rather than shown a blank page.
            Component: RequireDiagnosticsRoute,
            children: [{ path: "diagnostics", Component: TechnicalDiagnostics }],
          },
        ],
      },
    ],
  },
]);
