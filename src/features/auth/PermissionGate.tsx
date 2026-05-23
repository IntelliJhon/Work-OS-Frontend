import React from 'react';
import type { Permission } from './permission.constants';
import { usePermissions } from './usePermissions';

export interface PermissionGateProps {
  permission?: Permission;
  anyPermission?: Permission[];
  allPermissions?: Permission[];
  fallback?: React.ReactNode;
  behavior?: 'hide' | 'disable';
  tooltipMessage?: string;
  children: React.ReactElement;
}

export const PermissionGate: React.FC<PermissionGateProps> = ({
  permission,
  anyPermission,
  allPermissions,
  fallback = null,
  behavior = 'hide',
  tooltipMessage,
  children,
}) => {
  const { can, canAny, canAll } = usePermissions();

  let hasAccess = true;

  if (permission) {
    hasAccess = can(permission);
  } else if (anyPermission) {
    hasAccess = canAny(anyPermission);
  } else if (allPermissions) {
    hasAccess = canAll(allPermissions);
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  if (behavior === 'hide') {
    return <>{fallback}</>;
  }

  // behavior === 'disable'
  const defaultTooltip = tooltipMessage || "You do not have permission to perform this action";

  const childProps = (children.props as any) || {};
  const disabledChild = React.cloneElement(children, {
    disabled: true,
    className: `${childProps.className || ''} opacity-40 cursor-not-allowed pointer-events-none`.trim(),
  } as any);

  return (
    <div className="relative group inline-block w-full sm:w-auto">
      {disabledChild}
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-[#16161a] border border-red-500/20 text-[10px] text-red-400 font-medium px-2.5 py-1.5 rounded-lg shadow-2xl whitespace-nowrap z-50 transition-all select-none">
        {defaultTooltip}
      </div>
    </div>
  );
};
