import React from "react";
import { useAuth } from "../../context/AuthContext";
import type { UserRole } from "../../types";

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const DefaultFallback: React.FC = () => {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 max-w-md text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <svg className="w-7 h-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-slate-800 mb-2">Access Denied</h2>
        <p className="text-sm text-slate-500 mb-6">
          You do not have permission to access the Developer Dashboard. Only users with
          the <span className="font-medium text-slate-700">Developer</span> or{" "}
          <span className="font-medium text-slate-700">Architect</span> role can access this page.
        </p>
        <button
          onClick={logout}
          className="px-4 py-2 text-sm font-medium text-indigo-600 border border-indigo-200 rounded-xl hover:bg-indigo-50 transition-colors"
        >
          Sign out and try a different account
        </button>
      </div>
    </div>
  );
};

export const RoleGuard: React.FC<RoleGuardProps> = ({
  allowedRoles,
  children,
  fallback,
}) => {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated || !user) {
    // Auth pages are handled by App.tsx now
    return null;
  }

  if (!allowedRoles.includes(user.role)) {
    return <>{fallback || <DefaultFallback />}</>;
  }

  return <>{children}</>;
};
