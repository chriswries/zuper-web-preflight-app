import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthGuard } from "@/components/AuthGuard";
import { RoleGuard } from "@/components/RoleGuard";
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
import FalsePositivesPage from "./pages/settings/FalsePositivesPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<AuthGuard />}>
              <Route path="/" element={<AppLayout />}>
                <Route index element={<Navigate to="/pages" replace />} />
                <Route path="pages" element={<PagesPage />} />
                <Route path="pages/new" element={<AddPagePage />} />
                <Route path="pages/:id" element={<PageDetailPage />} />
                <Route path="pages/:id/agents/:agentId" element={<AgentReportPage />} />
                <Route path="queue" element={<QueuePage />} />
                <Route path="dashboard" element={<RoleGuard requiredRole="admin"><DashboardPage /></RoleGuard>} />
                <Route path="audit" element={<RoleGuard requiredRole="admin"><AuditPage /></RoleGuard>} />
                <Route path="settings/agents" element={<RoleGuard requiredRole="admin"><AgentsPage /></RoleGuard>} />
                <Route path="settings/users" element={<RoleGuard requiredRole="admin"><UsersPage /></RoleGuard>} />
                <Route path="settings/system" element={<RoleGuard requiredRole="admin"><SystemPage /></RoleGuard>} />
                <Route path="settings/false-positives" element={<RoleGuard requiredRole="admin"><FalsePositivesPage /></RoleGuard>} />
              </Route>
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
