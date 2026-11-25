import "@vly-ai/integrations";
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { InstrumentationProvider } from "@/instrumentation.tsx";
import { LanguageProvider } from "@/lib/i18n";
import { WolfAuthProvider, useWolfAuth } from "@/hooks/use-wolf-auth";
import { StrictMode, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Landing from "./pages/Landing";
import AuthPage from "./pages/Auth";
import AppHome from "./pages/AppHome";
import Dashboard from "./pages/Dashboard";
import AdminConsole from "./pages/AdminConsole";
import NotFound from "./pages/NotFound";
import AdminLogin from "./pages/AdminLogin";
import "./index.css";
import "./wolf-ui.css";
import "./styles/ui-pro.css";
import "./styles/landing.css";
import "./styles/lz-landing.css";
import "./styles/panel.css";
import "./styles/lz-adm.css";
import "./styles/lz-app.css";
import { bootWolfTheme } from "./lib/wolf-theme";
import "./types/global.d.ts";

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

/** Admin-only route: the API still enforces isAdmin on every request. */
function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin, token, isLoading } = useWolfAuth();
  if (isLoading && !token) return null;
  if (!isAdmin) return <Navigate to="/admin/login" replace />;
  // a user session must never walk straight into the console: the admin has to
  // unlock it on the dedicated login page (separate gate for this tab)
  if (window.sessionStorage.getItem("wolf.admin.gate") !== "1") return <Navigate to="/admin/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <RouteSyncer />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/auth"
          element={<AuthPage redirectAfterAuth="/app" />}
        />
        <Route path="/app" element={<RequireAuth><AppHome /></RequireAuth>} />
        {/* legacy panels stay reachable while their features are ported section by section */}
        <Route path="/app/full" element={<RequireAuth><Dashboard mode="user" /></RequireAuth>} />
        <Route path="/admin/full" element={<RequireAuth><RequireAdmin><Dashboard mode="full" /></RequireAdmin></RequireAuth>} />
        {/* old bookmarks: the legacy dashboard is gone, send them to the new panel */}
        <Route path="/dashboard" element={<Navigate to="/app/full" replace />} />
        {/* Dedicated entry points: /m for phones (no sidebar, bottom nav),
            /pc for desktops (wide, larger type). Same code, different skin. */}
        <Route path="/m" element={<RequireAuth><AppHome variant="mobile" /></RequireAuth>} />
        <Route path="/pc" element={<RequireAuth><AppHome variant="desktop" /></RequireAuth>} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<RequireAuth><RequireAdmin><AdminConsole /></RequireAdmin></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

// The Vly inspector is intentionally disabled for the application runtime.
// It installs a full-screen pointer-events overlay and is not part of the product.
const isVlyDevelopment = false;

bootWolfTheme();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
  <StrictMode>
    {isVlyDevelopment && <VlyToolbar />}
    <InstrumentationProvider>
      <LanguageProvider>
        <WolfAuthProvider>
          <AppRoutes />
          <Toaster />
        </WolfAuthProvider>
      </LanguageProvider>
    </InstrumentationProvider>
  </StrictMode>
  </ErrorBoundary>,
);
