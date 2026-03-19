import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";

import LoginPage from "./pages/LoginPage";
import PagesPage from "./pages/PagesPage";
import AddPagePage from "./pages/AddPagePage";
import PageDetailPage from "./pages/PageDetailPage";
import AgentReportPage from "./pages/AgentReportPage";
import QueuePage from "./pages/QueuePage";
import DashboardPage from "./pages/DashboardPage";
import AuditPage from "./pages/AuditPage";
import AgentsPage from "./pages/settings/AgentsPage";
import UsersPage from "./pages/settings/UsersPage";
import SystemPage from "./pages/settings/SystemPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Navigate to="/pages" replace />} />
            <Route path="pages" element={<PagesPage />} />
            <Route path="pages/new" element={<AddPagePage />} />
            <Route path="pages/:id" element={<PageDetailPage />} />
            <Route path="pages/:id/agents/:agentId" element={<AgentReportPage />} />
            <Route path="queue" element={<QueuePage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="settings/agents" element={<AgentsPage />} />
            <Route path="settings/users" element={<UsersPage />} />
            <Route path="settings/system" element={<SystemPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
