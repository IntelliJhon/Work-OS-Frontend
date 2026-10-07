import React, { Suspense } from 'react';
import { lazyPage } from './lazyPage';
import { BrowserRouter, Routes, Route, Navigate, Link, useParams } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { GuestRoute } from './GuestRoute';
import { AuthLayout } from '../layouts/AuthLayout';
import { DashboardLayout } from '../layouts/DashboardLayout';

// Lazy load pages for premium performance and separation
const Login = lazyPage(() => import('../../pages/auth/Login'));
const Register = lazyPage(() => import('../../pages/auth/Register'));
const ForgotPassword = lazyPage(() => import('../../pages/auth/ForgotPassword'));
const Overview = lazyPage(() => import('../../pages/dashboard/Overview'));
const ProjectList = lazyPage(() => import('../../pages/projects/ProjectList'));
const ProjectDetail = lazyPage(() => import('../../pages/projects/ProjectDetail'));
const ProjectWorkflow = lazyPage(() => import('../../pages/projects/ProjectWorkflow'));
const ProjectSprints = lazyPage(() => import('../../pages/projects/ProjectSprints'));
const ProjectGates = lazyPage(() => import('../../pages/projects/ProjectGates'));
const ProjectOPL = lazyPage(() => import('../../pages/projects/ProjectOPL'));
const ProjectActivitiesView = lazyPage(() => import('../../pages/projects/ProjectActivitiesView'));
const NotificationCenter = lazyPage(() => import('../../pages/notifications/NotificationCenter'));
const AccessDenied = lazyPage(() => import('../../pages/error/AccessDenied'));
const ProjectAnalytics = lazyPage(() => import('../../pages/projects/ProjectAnalytics'));
const ProjectScopes = lazyPage(() => import('../../pages/projects/ProjectScopes'));
const SettingsLayout = lazyPage(() => import('../layouts/SettingsLayout'));
const MembersManagement = lazyPage(() => import('../../pages/settings/MembersManagement'));
const RolesManagement = lazyPage(() => import('../../pages/settings/RolesManagement'));
const SecurityActivityCenter = lazyPage(() => import('../../pages/settings/SecurityActivityCenter'));
const VoiceNotesSettings = lazyPage(() => import('../../pages/settings/voice/VoiceNotesSettings'));
const VoiceNotesPage = lazyPage(() => import('../../pages/voice-notes/VoiceNotesPage'));
const WhatsAppBotsPage = lazyPage(() => import('../../pages/platform/WhatsAppBotsPage'));
const WorkspacesPage = lazyPage(() => import('../../pages/platform/WorkspacesPage'));
const AcceptInvite = lazyPage(() => import('../../pages/auth/AcceptInvite'));
const TasksPage = lazyPage(() => import('../../pages/tasks/TasksPage').then(m => ({ default: m.TasksPage })));
const CalendarPage = lazyPage(() => import('../../pages/calendar/CalendarPage'));
const AttendancePage = lazyPage(() => import('../../pages/attendance/AttendancePage'));
const LeavePage = lazyPage(() => import('../../pages/leave/LeavePage'));
const RemindersPage = lazyPage(() => import('../../pages/reminders/RemindersPage'));
const GroupsPage = lazyPage(() => import('../../pages/groups/GroupsPage'));
const WorkspaceClientsPage = lazyPage(() => import('../../pages/workspace-clients/WorkspaceClientsPage'));
const OnboardedClients = lazyPage(() => import('../../pages/clients/ClientsList'));
const EmployeesPage = lazyPage(() => import('../../pages/employees/EmployeesPage'));
const ComplaintsPage = lazyPage(() => import('../../pages/complaints/ComplaintsPage'));

import { PERMISSIONS } from '../../features/auth/permission.constants';

// Reusable page skeleton loader
const PageLoader = () => (
  <div className="w-full h-[60vh] flex flex-col items-center justify-center space-y-4">
    <div className="relative w-10 h-10">
      <div className="absolute inset-0 rounded-full border-t-2 border-r-2 border-blue-500 animate-spin"></div>
      <div className="absolute inset-0 rounded-full border-b-2 border-l-2 border-indigo-500/20 animate-spin duration-1000"></div>
    </div>
    <span className="text-xs font-light text-muted-foreground tracking-widest uppercase animate-pulse">
      Loading workspace
    </span>
  </div>
);

// Redirects /projects/:id/sprints to /projects/:id/activities to prevent relative resolution / double-slash blank page bug
const ProjectSprintsRedirect: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/projects/${id}/activities`} replace />;
};

export const AppRouter: React.FC = () => {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Guest Auth Routes */}
          <Route element={<GuestRoute />}>
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/invite/accept/:token" element={<AcceptInvite />} />
            </Route>
          </Route>

          {/* Protected Dashboard Routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<Overview />} />
              
              {/* Core Deliverables Suite */}
              <Route path="/projects" element={<ProjectList />} />
              <Route path="/dashboard/projects" element={<Navigate to="/projects" replace />} />
              
              <Route path="/projects/:id" element={<ProjectDetail />}>
                <Route index element={<Navigate to="scopes" replace />} />
                <Route path="scopes" element={<ProjectScopes />} />
                <Route path="analytics" element={<ProjectAnalytics />} />
                <Route path="workflow" element={<ProjectWorkflow />} />
                <Route path="sprints" element={<ProjectSprintsRedirect />} />
                <Route path="activities" element={<ProjectSprints />} />
                <Route path="opl" element={<ProjectOPL />} />
                <Route path="activities-view" element={<ProjectActivitiesView />} />
                <Route path="task-list" element={<Navigate to="activities-view" replace />} />
                <Route path="gates" element={<ProjectGates />} />
              </Route>

              <Route path="/notifications" element={<NotificationCenter />} />
              {/* The Clients section of every workspace; LeadsNDeals also keeps its CRM-linked Onboarded Clients page */}
              <Route path="/clients" element={<WorkspaceClientsPage />} />
              <Route path="/clients/:id" element={<WorkspaceClientsPage />} />
              <Route path="/onboarded-clients" element={<OnboardedClients />} />
              <Route path="/employees" element={<EmployeesPage />} />
              <Route path="/complaints" element={<ComplaintsPage />} />

              <Route element={<ProtectedRoute requiredPermissions={[PERMISSIONS.VOICE_NOTES_READ]} />}>
                <Route path="/voice-notes" element={<VoiceNotesPage />} />
              </Route>
              {/* Platform admins only (checked by the page and the API) */}
              <Route path="/platform/whatsapp-bots" element={<WhatsAppBotsPage />} />
              <Route path="/platform/workspaces" element={<WorkspacesPage />} />

              {/* Placeholders for secondary navigation */}
              <Route path="/dashboard/tasks" element={<TasksPage />} />
              <Route element={<ProtectedRoute requiredPermissions={[PERMISSIONS.TASK_READ]} />}>
                <Route path="/calendar" element={<CalendarPage />} />
              </Route>
              {/* Everyone: admins and PMs see the team, others their own history */}
              <Route path="/attendance" element={<AttendancePage />} />
              {/* Everyone applies; approvers see their requests (checked by the API) */}
              <Route path="/leave" element={<LeavePage />} />
              {/* Bills and renewals: own reminders; Admins see everyone's (checked by the API) */}
              <Route path="/reminders" element={<RemindersPage />} />
              <Route path="/reminders/:id" element={<RemindersPage />} />
              {/* Company group chats (members only, checked by the API) */}
              <Route path="/groups" element={<GroupsPage />} />
              <Route path="/groups/:id" element={<GroupsPage />} />
              <Route
                path="/dashboard/sprints"
                element={<Navigate to="/dashboard/activities" replace />}
              />
              <Route
                path="/dashboard/activities"
                element={
                  <div className="glass-panel rounded-2xl p-8 glow-primary">
                    <h2 className="text-xl font-bold mb-2">Activities</h2>
                    <p className="text-muted-foreground text-sm font-light">
                      Plan cycles, configure story weights, and run agile retrospectives. (Phase 2 Component)
                    </p>
                  </div>
                }
              />
              <Route
                path="/dashboard/workflow"
                element={
                  <div className="glass-panel rounded-2xl p-8 glow-primary">
                    <h2 className="text-xl font-bold mb-2">Workflow Governance</h2>
                    <p className="text-muted-foreground text-sm font-light">
                      Automated state transitions and escalation queues rules. (Phase 2 Component)
                    </p>
                  </div>
                }
              />
              <Route
                path="/dashboard/gates"
                element={
                  <div className="glass-panel rounded-2xl p-8 glow-primary">
                    <h2 className="text-xl font-bold mb-2">Quality Gates</h2>
                    <p className="text-muted-foreground text-sm font-light">
                      Configure gates and verify coverage policies prior to sprint advancement. (Phase 2 Component)
                    </p>
                  </div>
                }
              />
              <Route path="/403" element={<AccessDenied />} />

              {/* Settings Suite */}
              <Route path="/dashboard/settings" element={<Navigate to="/settings/members" replace />} />
              <Route path="/settings" element={<SettingsLayout />}>
                <Route index element={<Navigate to="members" replace />} />
                <Route element={<ProtectedRoute requiredPermissions={[PERMISSIONS.WORKSPACE_MEMBERS_READ]} />}>
                  <Route path="members" element={<MembersManagement />} />
                </Route>
                <Route element={<ProtectedRoute requiredPermissions={[PERMISSIONS.WORKSPACE_ROLES_READ]} />}>
                  <Route path="roles" element={<RolesManagement />} />
                </Route>
                <Route element={<ProtectedRoute requiredPermissions={[PERMISSIONS.WORKSPACE_SECURITY_READ]} />}>
                  <Route path="security" element={<SecurityActivityCenter />} />
                </Route>
                <Route element={<ProtectedRoute requiredPermissions={[PERMISSIONS.WORKSPACE_VOICE_MANAGE]} />}>
                  <Route path="voice-notes" element={<VoiceNotesSettings />} />
                </Route>
              </Route>
            </Route>
          </Route>

          {/* Root Redirects */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="*"
            element={
              <div className="min-h-screen bg-background flex flex-col items-center justify-center space-y-4 px-4 text-center">
                <h1 className="text-5xl font-extrabold text-blue-500 tracking-wider">404</h1>
                <h2 className="text-xl font-semibold">Page Not Found</h2>
                <p className="text-muted-foreground text-sm font-light max-w-sm">
                  The page you are looking for does not exist or has been moved.
                </p>
                <Link
                  to="/dashboard"
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-medium text-sm transition-all"
                >
                  Return to Workspace
                </Link>
              </div>
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};
