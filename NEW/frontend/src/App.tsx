import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersonaProvider } from './lib/persona';
import { AppLayout } from './shell/AppLayout';
import { Login } from './shell/Login';
import { InviteComplete } from './shell/InviteComplete';
import { DashboardPage } from './modules/dashboard/DashboardPage';
import { LmsPage } from './modules/lms/LmsPage';
import { CafePage } from './modules/cafe/CafePage';
import { SurveyPage } from './modules/survey/SurveyPage';
import { CommandCenterPage } from './modules/command-center/CommandCenterPage';
import { AnalyticsPage } from './modules/command-center/AnalyticsPage';
import { ComingSoon } from './modules/stubs/ComingSoon';
import { GlobalSearchPage } from './modules/search/GlobalSearchPage';
import { DocumentEditorPage } from './modules/cafe/DocumentEditorPage';
import { CmsDmsShowcasePage } from './modules/cms-dms/CmsDmsShowcasePage';
import { MarketingLayout } from './marketing/MarketingLayout';
import { MarketingHome } from './marketing/MarketingHome';
import { MarketingSolution } from './marketing/MarketingSolution';
import { MarketingNews } from './marketing/MarketingNews';
import { TcsEntry } from './tcs/TcsEntry';
import { TcsGuard } from './tcs/TcsGuard';
import { TcsLayout } from './tcs/TcsLayout';
import { OrganizationsPage } from './tcs/pages/OrganizationsPage';
import { OrganizationDetailPage } from './tcs/pages/OrganizationDetailPage';
import { UserDetailPage } from './tcs/pages/UserDetailPage';
import { UsersPage } from './tcs/pages/UsersPage';
import { RolesPage } from './tcs/pages/RolesPage';
import { PlatformRoleDetailPage } from './tcs/pages/PlatformRoleDetailPage';
import { OrgRoleDetailPage } from './tcs/pages/OrgRoleDetailPage';
import { SecurityPage } from './tcs/pages/SecurityPage';
import { LogsPage } from './tcs/pages/LogsPage';

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } },
});

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <PersonaProvider>
        <BrowserRouter>
          <Routes>
            {/* Public marketing site (its own chrome) — the front door, Contentful-authored */}
            <Route element={<MarketingLayout />}>
              <Route path="/" element={<MarketingHome />} />
              <Route path="/solutions/:slug" element={<MarketingSolution />} />
              <Route path="/whats-new" element={<MarketingNews />} />
            </Route>
            {/* Customer portal sign-in */}
            <Route path="/login" element={<Login />} />
            <Route path="/invite/complete" element={<InviteComplete />} />
            <Route path="/tcs/login" element={<Navigate to="/login" replace />} />
            <Route path="/tcs">
              <Route index element={<TcsEntry />} />
              <Route element={<TcsGuard />}>
                <Route element={<TcsLayout />}>
                  <Route path="organizations" element={<OrganizationsPage />} />
                  <Route path="organizations/:orgId" element={<OrganizationDetailPage />} />
                  <Route path="organizations/:orgId/roles/:roleKey" element={<OrgRoleDetailPage />} />
                  <Route path="users" element={<UsersPage />} />
                  <Route path="users/:userId" element={<UserDetailPage />} />
                  <Route path="roles" element={<RolesPage />} />
                  <Route path="roles/:roleId" element={<PlatformRoleDetailPage />} />
                  <Route path="security" element={<SecurityPage />} />
                  <Route path="logs" element={<LogsPage />} />
                </Route>
              </Route>
            </Route>
            {/* Focused full-screen document editor (its own chrome, no app sidebar) */}
            <Route path="/cafe/d/:docId" element={<DocumentEditorPage />} />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/lms" element={<LmsPage />} />
              <Route path="/cafe" element={<CafePage />} />
              <Route path="/survey" element={<SurveyPage />} />
              <Route path="/cms-dms" element={<CmsDmsShowcasePage />} />
              <Route path="/command-center" element={<CommandCenterPage />} />
              <Route path="/command-center/analytics" element={<AnalyticsPage />} />
              <Route path="/ai-search" element={<GlobalSearchPage />} />
              <Route
                path="/ai-chat"
                element={
                  <ComingSoon
                    title="AI Chat"
                    blurb="Compliance AI Chat with a daily request allowance — a foundational tier feature."
                  />
                }
              />
              <Route
                path="/ticketing"
                element={
                  <ComingSoon
                    title="Ticketing"
                    blurb="Customer support channel (build vs buy). Raise tickets from dashboard alerts; status surfaces in-app."
                  />
                }
              />
              <Route
                path="/poc"
                element={
                  <ComingSoon
                    title="POC Advanced"
                    blurb="Multi-user collaborative Plan of Correction with workflow routing and a portfolio dashboard. Plan-of-Correction creation from survey findings is available today inside Survey Readiness."
                  />
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </PersonaProvider>
    </QueryClientProvider>
  );
}
