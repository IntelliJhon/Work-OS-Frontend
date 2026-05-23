import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Users, Shield, Lock, ChevronRight } from 'lucide-react';
import { usePermissions } from '../../features/auth/usePermissions';

export const SettingsLayout: React.FC = () => {
  const location = useLocation();
  const { can } = usePermissions();

  const menuItems = [
    {
      name: 'Members & Invites',
      path: '/settings/members',
      icon: Users,
      description: 'Manage workspace members and send invitations.',
      permission: 'workspace.members.read',
    },
    {
      name: 'Roles & Permissions',
      path: '/settings/roles',
      icon: Shield,
      description: 'Define roles, customize permissions, and RBAC matrix.',
      permission: 'workspace.roles.read',
    },
    {
      name: 'Security & Audit Feed',
      path: '/settings/security',
      icon: Lock,
      description: 'View tenant audit logs, sign-in history, and activity.',
      permission: 'workspace.security.read',
    },
  ];

  const filteredItems = menuItems.filter(item => can(item.permission as any));

  return (
    <div className="flex flex-col lg:flex-row gap-8 w-full min-h-[calc(100vh-8rem)]">
      {/* Settings Navigation Sidebar */}
      <aside className="w-full lg:w-72 shrink-0">
        <div className="glass-panel rounded-2xl p-6 glow-primary border border-border bg-card/40 space-y-6">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">Settings</h2>
            <p className="text-xs text-muted-foreground mt-1 font-light">
              Manage your WorkOS tenant configuration.
            </p>
          </div>
          <nav className="space-y-1">
            {filteredItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  className={`flex items-start space-x-3.5 px-4 py-3.5 rounded-xl transition-all border ${
                    isActive
                      ? 'bg-blue-600/10 border-blue-500/30 text-blue-400 glow-primary'
                      : 'text-muted-foreground hover:text-white hover:bg-white/5 border-transparent'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground font-light leading-normal mt-0.5">
                      {item.description}
                    </p>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 mt-1 transition-transform ${isActive ? 'rotate-90 text-blue-400' : 'text-zinc-600'}`} />
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* Settings Main Content View */}
      <div className="flex-1 min-w-0">
        <Outlet />
      </div>
    </div>
  );
};

export default SettingsLayout;
