import React from 'react';
import { Outlet } from 'react-router-dom';

export const AuthLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-background relative flex items-center justify-center overflow-hidden px-4">
      {/* Animated glow background blobs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-blue-500/10 blur-[120px] animate-pulse duration-[8000ms]" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-indigo-500/10 blur-[120px] animate-pulse duration-[6000ms]" />

      <div className="w-full max-w-md relative z-10">
        {/* Header/Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center space-x-2 mb-2">
            {/* Premium Logo mark */}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg glow-primary">
              <span className="font-bold text-slate-900 dark:text-white text-lg tracking-wider">W</span>
            </div>
            <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Work<span className="text-blue-500">OS</span>
            </span>
          </div>
          <p className="text-muted-foreground text-sm font-light">
            Enterprise workflow and governance platform
          </p>
        </div>

        {/* Glassmorphic card */}
        <div className="glass-panel-heavy rounded-2xl p-8 shadow-2xl glow-primary">
          <Outlet />
        </div>
      </div>
    </div>
  );
};
export default AuthLayout;
