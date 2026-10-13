import { RouterProvider } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { router } from "./routes";
import { LanguageProvider } from "./contexts/LanguageContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useLanguage } from "./contexts/LanguageContext";
import { AuthProvider } from "@/features/auth/AuthContext";
import { queryClient } from "@/lib/api/queryClient";
import { useEffect } from "react";

/**
 * Provider tree.
 *
 * Order matters: theme and language are pure presentation and wrap everything; the query cache sits
 * above auth because AuthProvider's own requests go through it; auth sits above the router so every
 * route can read the session.
 */

function DirController() {
  const { isRTL, lang } = useLanguage();
  useEffect(() => {
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [isRTL, lang]);
  return null;
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <DirController />
            <RouterProvider router={router} />
            <Toaster position="top-center" richColors />
          </AuthProvider>
        </QueryClientProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
