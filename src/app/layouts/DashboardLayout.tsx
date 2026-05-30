import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { useSocket } from '../../services/socket/socket-context';
import { useSocketEvent } from '../../services/socket/socket-events';
import type { NotificationPayload } from '../../services/socket/socket-events';
import { getRefreshToken } from '../../utils/cookies';
import { apiClient } from '../../services/api/client';
import { usePermissions } from '../../features/auth/usePermissions';
import { PERMISSIONS } from '../../features/auth/permission.constants';
import { notificationsApi } from '../../services/api/notifications';
import { projectsApi } from '../../services/api/projects';
import type { Project } from '../../services/api/projects';
import { AlertSoundManager } from '../../components/notifications/AlertSoundManager';
import { RealtimeAlertToast, triggerRealtimeToast } from '../../components/notifications/RealtimeAlertToast';
import { NotificationDrawer } from '../../components/notifications/NotificationDrawer';
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
  User,
  Radio,
  Moon,
  Sun
} from 'lucide-react';

export const DashboardLayout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { sidebarOpen, toggleSidebar, theme, toggleTheme } = useUIStore();
  const { socket, isConnected } = useSocket();

  const [notifications, setNotifications] = useState<NotificationPayload[]>([]);
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [shakeBell, setShakeBell] = useState(false);

  // Premium sign-out transition states
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutProgress, setSignOutProgress] = useState(0);
  const [signOutStep, setSignOutStep] = useState('');

  // Load initial notifications and projects list
  useEffect(() => {
    if (user) {
      notificationsApi.list()
        .then((data) => {
          setNotifications(data);
          setUnreadCount(data.filter(n => !n.isRead).length);
        })
        .catch((err) => console.error('[DashboardLayout] Failed to load alerts list', err));

      projectsApi.list()
        .then((data) => setProjectsList(data))
        .catch((err) => console.error('[DashboardLayout] Failed to load projects list', err));
    }
  }, [user]);

  // Bind live Socket.IO events for notifications
  useSocketEvent<NotificationPayload>('NOTIFICATION_CREATED', (notification) => {
    setNotifications((prev) => [notification, ...prev]);
    setUnreadCount((prev) => prev + 1);

    // Trigger shaking animation on the bell icon
    setShakeBell(true);
    setTimeout(() => setShakeBell(false), 1200);

    // Trigger premium real-time slide-in toast
    triggerRealtimeToast({
      title: notification.title,
      message: notification.message,
      priority: notification.priority || 'info',
      type: notification.type,
      entityType: notification.entityType,
      entityId: notification.entityId,
      metadata: notification.metadata,
    });
  });

  useSocketEvent<{ count: number }>('UNREAD_COUNT_UPDATED', ({ count }) => {
    setUnreadCount(count);
  });

  // Focus heartbeat reporting (heartbeat focus updates across the tenant)
  useEffect(() => {
    if (!socket || !isConnected || !user) return;

    // Parse project id from pathname: e.g. /projects/:projectId/...
    const pathParts = location.pathname.split('/');
    const isProjectPage = pathParts[1] === 'projects';
    const projectId = isProjectPage ? pathParts[2] : undefined;

    // Determine sub-page page context
    let page = 'detail';
    if (isProjectPage && pathParts[3]) {
      page = pathParts[3]; // workflow, sprints, activities, gates, activity
    }

    if (!projectId) return;

    const emitFocus = () => {
      socket.emit('report_focus', {
        projectId,
        page
      });
    };

    // Emit focus update immediately on URL path/page transitions
    emitFocus();

    const interval = setInterval(emitFocus, 5000);
    return () => clearInterval(interval);
  }, [socket, isConnected, location.pathname, user]);

  const handleLogout = async () => {
    setIsSigningOut(true);
    setSignOutProgress(0);

    const steps = [
      "Securing active sessions...",
      "Disconnecting real-time sockets...",
      "Revoking authentication credentials...",
      "Safely logged out. See you soon!"
    ];

    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += 2;
      setSignOutProgress(currentProgress);

      // Map progress to steps
      if (currentProgress < 25) setSignOutStep(steps[0]);
      else if (currentProgress < 50) setSignOutStep(steps[1]);
      else if (currentProgress < 75) setSignOutStep(steps[2]);
      else setSignOutStep(steps[3]);

      if (currentProgress >= 100) {
        clearInterval(interval);
        
        // Execute actual log out and navigate
        (async () => {
          try {
            const refreshToken = getRefreshToken();
            if (refreshToken) {
              await apiClient.post('/auth/logout', { refreshToken });
            }
          } catch (err) {
            console.error('[DashboardLayout] Logout API call failed', err);
          } finally {
            logout();
            navigate('/login');
          }
        })();
      }
    }, 25);
  };


  const { can } = usePermissions();

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Projects', path: '/projects', icon: FolderKanban },
    { name: 'Alerts Center', path: '/notifications', icon: Bell },
    { name: 'Tasks', path: '/dashboard/tasks', icon: CheckSquare, permission: PERMISSIONS.TASK_READ },
    { name: 'Settings', path: '/settings/members', icon: Settings, permission: PERMISSIONS.WORKSPACE_MEMBERS_READ },
  ];

  const filteredItems = navItems.filter((item) => {
    if (item.permission) {
      return can(item.permission);
    }
    return true;
  });





  const parseMetadata = (meta: any): any => {
    if (!meta) return null;
    if (typeof meta === 'string') {
      try {
        return JSON.parse(meta);
      } catch (e) {
        return null;
      }
    }
    return meta;
  };

  // Helper to resolve deep link based on entityType and entityId
  const resolveDeepLinkPath = (alert: NotificationPayload): string | null => {
    if (!alert.entityType || !alert.entityId) {
      if (projectsList.length > 0) {
        return `/projects/${projectsList[0].id}/workflow`;
      }
      return null;
    }

    const type = alert.entityType.toLowerCase();
    const id = alert.entityId;
    const parsed = parseMetadata(alert.metadata);

    if (type === 'phase') {
      const proj = projectsList.find((p) => p.phases?.some((ph) => ph.id === id)) || 
                   (parsed?.projectId ? projectsList.find(p => p.id === parsed.projectId) : null);
      if (proj) return `/projects/${proj.id}/workflow`;
    }
    if (type === 'sprint' || type === 'activity') {
      const proj = projectsList.find((p) => p.sprints?.some((sp) => sp.id === id)) || 
                   (parsed?.projectId ? projectsList.find(p => p.id === parsed.projectId) : null);
      if (proj) return `/projects/${proj.id}/activities`;
    }
    if (type === 'gate') {
      const proj = projectsList.find((p) => p.gates?.some((gt) => gt.id === id)) || 
                   (parsed?.projectId ? projectsList.find(p => p.id === parsed.projectId) : null);
      if (proj) return `/projects/${proj.id}/gates`;
    }
    if (type === 'task') {
      const createdFrom = parsed?.createdFrom;
      const projectId = parsed?.projectId;
      if (createdFrom === 'sprint' && projectId) {
        return `/projects/${projectId}/activities`;
      }
      if (createdFrom === 'sidebar') {
        return `/dashboard/tasks`;
      }
      
      const sprintId = parsed?.sprintId;
      if (sprintId && projectId) {
        return `/projects/${projectId}/activities`;
      }
      return `/dashboard/tasks`;
    }

    // Default project fallback
    if (projectsList.length > 0) {
      const pId = parsed?.projectId || projectsList[0].id;
      return `/projects/${pId}/${type === 'gate' ? 'gates' : (type === 'sprint' || type === 'activity') ? 'activities' : 'workflow'}`;
    }

    return null;
  };

  const handleAlertClick = async (alert: NotificationPayload) => {
    setShowNotifications(false);
    if (!alert.id) {
      navigate('/notifications');
      return;
    }
    if (!alert.isRead) {
      try {
        await notificationsApi.markRead(alert.id);
        // Refresh local count and read status
        setNotifications(prev => prev.map(n => n.id === alert.id ? { ...n, isRead: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
      } catch (err) {
        console.error('[DashboardLayout] Mark notification read failed', err);
      }
    }
    const path = resolveDeepLinkPath(alert);
    if (path) {
      navigate(path);
    }
  };



  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('[DashboardLayout] Failed to mark all notifications read', err);
    }
  };

  return (
    <div className="min-h-screen bg-background flex text-foreground overflow-hidden">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 backdrop-blur-sm md:hidden transition-opacity duration-300"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-card/60 backdrop-blur-xl border-r border-border transition-transform duration-300 transform ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-border">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg glow-primary">
              <span className="font-bold text-slate-900 dark:text-white text-sm">W</span>
            </div>
            <span className="text-lg font-bold tracking-tight text-foreground">
              Work<span className="text-blue-500">OS</span>
            </span>
          </div>
          <button onClick={toggleSidebar} className="md:hidden text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Profile Card Summary */}
        <div className="px-4 py-4 border-b border-slate-200/50 dark:border-border/50">
          <div className="flex items-center space-x-3 p-2 rounded-xl bg-muted/50 border border-border">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <User className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate text-foreground">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-muted-foreground capitalize truncate">
                {user?.role} Role
              </p>
            </div>
          </div>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto max-h-[calc(100vh-170px)]">
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600/10 border border-blue-500/20 text-blue-400 glow-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-200/50 dark:border-border/50 absolute bottom-0 w-full left-0 bg-background/80">
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-3 text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl border border-transparent hover:border-red-500/20 transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Pane */}
      <div
        className={`flex-1 flex flex-col min-w-0 relative overflow-hidden transition-all duration-300 ${
          sidebarOpen ? 'md:pl-64' : 'md:pl-0'
        }`}
      >
        {/* Top Navbar */}
        <header className="h-16 border-b border-border bg-background/50 backdrop-blur-md flex items-center justify-between px-6 z-20">
          <div className="flex items-center space-x-4">
            <button
              onClick={toggleSidebar}
              className="text-muted-foreground hover:text-foreground focus:outline-none"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="hidden sm:flex items-center space-x-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted border border-border text-muted-foreground uppercase tracking-wider">
                Tenant Context
              </span>
              <span className="text-sm font-medium text-foreground max-w-[150px] truncate">
                Workspace: {user?.tenantId ? 'Provisioned' : 'N/A'}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Realtime Live Socket Indicator */}
            <div
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs border ${
                isConnected
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${isConnected ? 'animate-pulse' : ''}`} />
              <span className="font-medium tracking-wide uppercase">
                {isConnected ? 'Live Socket' : 'Disconnected'}
              </span>
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-all"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5" />}
            </button>

            {/* Elegant Audio Chime Synthesizer */}
            <AlertSoundManager />

            {/* Notifications Panel Trigger */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowNotifications(true);
                }}
                className={`p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-all relative ${
                  shakeBell ? 'animate-bounce text-blue-400' : ''
                }`}
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-blue-500 rounded-full text-[10px] font-bold text-slate-900 dark:text-white flex items-center justify-center animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Dynamic Nested Routes View */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          <Outlet />
        </main>
      </div>

      {/* Real-time Toast Alerts Stream Container */}
      <RealtimeAlertToast />

      {/* Slide-out glassmorphic panel NotificationDrawer */}
      <NotificationDrawer
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkRead={async (id) => {
          try {
            await notificationsApi.markRead(id);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
          } catch (err) {
            console.error('[DashboardLayout] Failed to mark read', err);
          }
        }}
        onMarkAllRead={handleMarkAllRead}
        onAlertClick={handleAlertClick}
      />

      {/* Sign Out Premium Fullscreen Overlay */}
      {isSigningOut && createPortal(
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-50 dark:bg-[#070b19] text-slate-900 dark:text-white transition-all duration-300">
          {/* Soft floating background glows */}
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-red-500/5 blur-[150px] animate-pulse duration-[10000ms]" />
          <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-orange-500/5 blur-[150px] animate-pulse duration-[8000ms]" />

          <div className="relative z-10 flex flex-col items-center max-w-sm w-full px-6 text-center">
            {/* Brand Logo with pulse */}
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-red-500 to-orange-600 flex items-center justify-center shadow-2xl glow-primary animate-pulse mb-8">
              <span className="font-bold text-white text-4xl tracking-wider select-none">W</span>
            </div>

            {/* Loader text */}
            <div className="space-y-2 h-14">
              <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white/90 drop-shadow-md">
                {signOutStep}
              </h3>
              <p className="text-xs text-orange-600 dark:text-orange-400 font-mono tracking-wider">
                Session Termination: {signOutProgress}%
              </p>
            </div>

            {/* Progress bar container */}
            <div className="w-full h-1.5 bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden border border-slate-300/40 dark:border-white/5 shadow-inner mt-8">
              <div 
                className="h-full bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 rounded-full transition-all duration-[75ms] ease-out shadow-[0_0_12px_rgba(239,68,68,0.8)]"
                style={{ width: `${signOutProgress}%` }}
              />
            </div>

            <div className="mt-12 flex items-center space-x-2 text-[10px] text-slate-500 dark:text-muted-foreground/60 tracking-widest uppercase">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
              <span>Secure Session Encrypted</span>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
export default DashboardLayout;
