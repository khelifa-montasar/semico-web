import { Suspense } from "react";
import { Outlet } from "react-router";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { RouteFallback } from "./RouteFallback";
import { useLanguage } from "../contexts/LanguageContext";

export function PublicLayout() {
  const { isRTL, font } = useLanguage();

  return (
    <div
      className="min-h-screen flex flex-col bg-white"
      style={{ fontFamily: font }}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <Navbar />
      <main className="flex-1">
        {/* Inside the layout, not around the router, so the navbar and footer stay mounted while a
            lazily-loaded page is fetched. */}
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
