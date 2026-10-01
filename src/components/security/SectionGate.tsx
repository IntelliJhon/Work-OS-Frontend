import React from 'react';
import { useLocation } from 'react-router-dom';
import { EyeOff } from 'lucide-react';
import { SECTION_LABELS, sectionOfPath, useSections } from '../../services/api/workspace';

/** Pages of a section the workspace has switched off show a notice instead (the API refuses their data too) */
export const SectionGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const { isOn } = useSections();
  const section = sectionOfPath(pathname);
  if (isOn(section)) return <>{children}</>;
  return (
    <div className="glass-panel rounded-2xl p-8 border border-border bg-card/40 max-w-xl flex items-start gap-3">
      <EyeOff className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
      <div>
        <h1 className="text-sm font-bold text-foreground">{SECTION_LABELS[section!]} is not available</h1>
        <p className="text-xs text-muted-foreground mt-1">This section is turned off for your workspace. Contact Work OS support to turn it on.</p>
      </div>
    </div>
  );
};
