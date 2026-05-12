import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useApp } from "@/context/AppContext";
import AppDock from "@/components/AppDock";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AppShell() {
  const { isAuthenticated } = useApp();
  if (!isAuthenticated) return <AuthPage />;
  return (
    <>
      <Outlet />
      <AppDock />
    </>
  );
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/accept-invite" element={<AcceptInvitePage />} />
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/my-health" element={<MyHealthPage />} />
          <Route path="/people-you-track" element={<PeopleYouTrackPage />} />
          <Route path="/workspace" element={<FamilyWorkspacePage />} />
          <Route path="/member/:id" element={<MemberDetail />} />
          <Route path="/member/:id/doctor-summary" element={<DoctorSummaryPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/memory" element={<MemorySearchPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/automation" element={<AutomationPage />} />
          <Route path="/chat-ingest" element={<ChatIngestPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
