import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Outlet, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useApp } from "@/context/AppContext";
import AppDock from "@/components/AppDock";
import AppTopBar from "@/components/AppTopBar";
import AppSidebar from "@/components/AppSidebar";
import HealthHubLayout from "@/layouts/HealthHubLayout";
import FamilyHubLayout from "@/layouts/FamilyHubLayout";
import InsightsHubLayout from "@/layouts/InsightsHubLayout";
import YouHubLayout from "@/layouts/YouHubLayout";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/ThemeProvider";
import AuthPage from "./pages/AuthPage";
import AcceptInvitePage from "./pages/AcceptInvitePage";
import Dashboard from "./pages/Dashboard";
import FamilyWorkspacePage from "./pages/FamilyWorkspacePage";
import MyHealthPage from "./pages/MyHealthPage";
import PeopleYouTrackPage from "./pages/PeopleYouTrackPage";
import MemberDetail from "./pages/MemberDetail";
import DoctorSummaryPage from "./pages/DoctorSummaryPage";
import InsightsPage from "./pages/InsightsPage";
import TeamPage from "./pages/TeamPage";
import AutomationPage from "./pages/AutomationPage";
import ChatIngestPage from "./pages/ChatIngestPage";
import MemorySearchPage from "./pages/MemorySearchPage";
import AdminPage from "./pages/AdminPage";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/SettingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppShell() {
  const { isAuthenticated } = useApp();
  if (!isAuthenticated) return <AuthPage />;
  return (
    <div
      className={cn(
        "min-h-dvh w-full",
        "bg-muted/35",
        "bg-[radial-gradient(ellipse_100%_60%_at_50%_-8%,hsl(var(--primary)/0.09),transparent_55%)]",
        "md:bg-muted/40 md:bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,hsl(var(--primary)/0.07),transparent_50%),radial-gradient(ellipse_60%_40%_at_100%_100%,hsl(var(--insight)/0.06),transparent_45%)]",
        "lg:bg-gradient-to-br lg:from-muted/50 lg:via-background lg:to-muted/30"
      )}
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-[1920px] flex-col lg:flex-row lg:items-stretch">
        <aside
          className={cn(
            "print:hidden",
            "hidden shrink-0 lg:flex lg:w-[min(17rem,22vw)] lg:flex-col lg:border-r lg:border-border/50 lg:bg-card/40 lg:backdrop-blur-md",
            "xl:w-72"
          )}
        >
          <AppSidebar />
        </aside>

        <div className="relative flex min-h-dvh min-w-0 flex-1 flex-col">
          <div
            className={cn(
              "relative mx-auto flex w-full flex-1 flex-col bg-background",
              "max-w-full min-h-dvh",
              "shadow-[0_0_0_1px_hsl(var(--border)/0.35)]",
              "sm:max-w-[420px] sm:shadow-[0_0_0_1px_hsl(var(--border)/0.35)]",
              "md:my-4 md:min-h-[calc(100dvh-2rem)] md:max-w-[min(42rem,calc(100%-1.5rem))] md:overflow-hidden md:rounded-[1.35rem] md:shadow-soft-lg md:ring-1 md:ring-border/40",
              "lg:my-0 lg:min-h-dvh lg:max-w-none lg:rounded-none lg:shadow-none lg:ring-0",
              "xl:mx-auto xl:max-w-[min(80rem,calc(100%-3rem))]"
            )}
          >
            <AppTopBar />
            <div className="flex flex-1 flex-col lg:overflow-y-auto lg:pt-0">
              <Outlet />
            </div>
            <AppDock />
          </div>
        </div>
      </div>
    </div>
  );
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />

          <Route path="/health" element={<HealthHubLayout />}>
            <Route index element={<Navigate to="my" replace />} />
            <Route path="my" element={<MyHealthPage />} />
            <Route path="tracked" element={<PeopleYouTrackPage />} />
          </Route>

          <Route path="/family" element={<FamilyHubLayout />}>
            <Route index element={<Navigate to="workspace" replace />} />
            <Route path="workspace" element={<FamilyWorkspacePage />} />
            <Route path="team" element={<TeamPage />} />
          </Route>

          <Route path="/insights" element={<InsightsHubLayout />}>
            <Route index element={<Navigate to="patterns" replace />} />
            <Route path="patterns" element={<InsightsPage />} />
            <Route path="memory" element={<MemorySearchPage />} />
          </Route>

          <Route path="/you" element={<YouHubLayout />}>
            <Route index element={<Navigate to="profile" replace />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="automation" element={<AutomationPage />} />
            <Route path="chat-ingest" element={<ChatIngestPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>

          <Route path="/member/:id" element={<MemberDetail />} />
          <Route path="/member/:id/doctor-summary" element={<DoctorSummaryPage />} />

          <Route path="/my-health" element={<Navigate to="/health/my" replace />} />
          <Route path="/people-you-track" element={<Navigate to="/health/tracked" replace />} />
          <Route path="/workspace" element={<Navigate to="/family/workspace" replace />} />
          <Route path="/team" element={<Navigate to="/family/team" replace />} />
          <Route path="/memory" element={<Navigate to="/insights/memory" replace />} />
          <Route path="/profile" element={<Navigate to="/you/profile" replace />} />
          <Route path="/automation" element={<Navigate to="/you/automation" replace />} />
          <Route path="/admin" element={<Navigate to="/you/admin" replace />} />
          <Route path="/chat-ingest" element={<Navigate to="/you/chat-ingest" replace />} />

          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppProvider>
          <AppRoutes />
        </AppProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
