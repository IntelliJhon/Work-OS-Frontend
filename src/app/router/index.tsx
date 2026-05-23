import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { GuestRoute } from './GuestRoute';
import { AuthLayout } from '../layouts/AuthLayout';
import { DashboardLayout } from '../layouts/DashboardLayout';

// Lazy load pages for premium performance and separation
const Login = lazy(() => import('../../pages/auth/Login'));
const Register = lazy(() => import('../../pages/auth/Register'));
const Overview = lazy(() => import('../../pages/dashboard/Overview'));
const ProjectList = lazy(() => import('../../pages/projects/ProjectList'));
const ProjectDetail = lazy(() => import('../../pages/projects/ProjectDetail'));
const ProjectWorkflow = lazy(() => import('../../pages/projects/ProjectWorkflow'));
const ProjectSprints = lazy(() => import('../../pages/projects/ProjectSprints'));
const ProjectGates = lazy(() => import('../../pages/projects/ProjectGates'));
const NotificationCenter = lazy(() => import('../../pages/notifications/NotificationCenter'));
const AccessDenied = lazy(() => import('../../pages/error/AccessDenied'));
const ActivityFeed = lazy(() => import('../../pages/projects/ActivityFeed'));
const SettingsLayout = lazy(() => import('../layouts/SettingsLayout'));
const MembersManagement = lazy(() => import('../../pages/settings/MembersManagement'));
const RolesManagement = lazy(() => import('../../pages/settings/RolesManagement'));
const SecurityActivityCenter = lazy(() => import('../../pages/settings/SecurityActivityCenter'));
const AcceptInvite = lazy(() => import('../../pages/auth/AcceptInvite'));
const TasksPage = lazy(() => import('../../pages/tasks/TasksPage').then(m => ({ default: m.TasksPage })));

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
                <Route index element={<Navigate to="workflow" replace />} />
                <Route path="workflow" element={<ProjectWorkflow />} />
                <Route path="sprints" element={<ProjectSprints />} />
                <Route path="gates" element={<ProjectGates />} />
                <Route path="activity" element={<ActivityFeed />} />
              </Route>

              <Route path="/notifications" element={<NotificationCenter />} />

              {/* Placeholders for secondary navigation */}
              <Route path="/dashboard/tasks" element={<TasksPage />} />
              <Route
                path="/dashboard/sprints"
                element={
                  <div className="glass-panel rounded-2xl p-8 glow-primary">
                    <h2 className="text-xl font-bold mb-2">Sprints</h2>
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
