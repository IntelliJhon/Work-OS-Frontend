import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, HelpCircle } from 'lucide-react';

export const AccessDenied: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-6 py-12 text-center select-none">
      <div className="relative mb-6">
        {/* Sleek outer glowing ring */}
        <div className="absolute inset-0 rounded-full bg-red-500/10 blur-xl animate-pulse"></div>
        <div className="relative w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <ShieldAlert className="w-10 h-10 text-red-500" />
        </div>
      </div>

      <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-2">
        403 - Access Denied
      </h1>
      <h2 className="text-base font-medium text-red-400/90 mb-4 uppercase tracking-wider text-xs">
        Insufficient Governance Permissions
      </h2>

      <p className="text-muted-foreground text-sm font-light max-w-md mb-8 leading-relaxed">
        Your current user role does not have the required permissions to access this module or perform this workflow transition. 
        If this is an error, please reach out to your Workspace Admin.
      </p>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-xs sm:max-w-md">
        <button
          onClick={() => navigate(-1)}
          className="w-full sm:w-auto px-6 py-3 rounded-xl border border-slate-200/60 dark:border-white/10 hover:border-white/20 text-white/90 hover:text-white font-medium text-xs tracking-wider uppercase transition-all flex items-center justify-center space-x-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Go Back</span>
        </button>

        <Link
          to="/dashboard"
          className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs tracking-wider uppercase transition-all shadow-lg glow-primary flex items-center justify-center"
        >
          Return to Dashboard
        </Link>
      </div>

      <div className="mt-12 flex items-center space-x-2 text-xs text-muted-foreground/60 font-light border-t border-border/40 pt-4 w-full max-w-sm justify-center">
        <HelpCircle className="w-4 h-4" />
        <span>Need assistance? Contact support@workos.com</span>
      </div>
    </div>
  );
};

export default AccessDenied;
