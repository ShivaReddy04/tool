import React from "react";
import { Button } from "../components/common";
import { useAuth } from "../context/AuthContext";

export const UnauthorizedPage: React.FC = () => {
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
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-slate-800 mb-2">Access Denied</h2>
        <p className="text-sm text-slate-500 mb-6">
          Your current role does not have permission to access the Developer Dashboard.
          Only <span className="font-medium text-slate-700">Developer</span> and{" "}
          <span className="font-medium text-slate-700">Architect</span> roles are authorized.
        </p>
        <Button variant="outline" onClick={logout}>
          Sign Out
        </Button>
      </div>
    </div>
  );
};
