import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Outlet, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider, useApp } from "@/context/AppContext";
import AppDock from "@/components/AppDock";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";
import MemberDetail from "./pages/MemberDetail";
import InsightsPage from "./pages/InsightsPage";
import TeamPage from "./pages/TeamPage";
import AutomationPage from "./pages/AutomationPage";
import ChatIngestPage from "./pages/ChatIngestPage";
import AdminPage from "./pages/AdminPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AuthedLayout() {
  return (
    <>
      <Outlet />
      <AppDock />
    </>
  );
}

function AppRoutes() {
  const { isAuthenticated } = useApp();

  if (!isAuthenticated) return <AuthPage />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AuthedLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/member/:id" element={<MemberDetail />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/team" element={<TeamPage />} />
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
