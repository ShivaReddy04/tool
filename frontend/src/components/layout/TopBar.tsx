import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useDashboard } from "../../context/DashboardContext";
import { Badge } from "../common";

export const TopBar: React.FC = () => {
  const { user, logout } = useAuth();
  const { notifications } = useDashboard();
  const navigate = useNavigate();
  const location = useLocation();
  const [draftsCount, setDraftsCount] = useState<number | null>(null);

  // Only count notifications targeted at the current user's role — matches
  // what they'll actually see when they land on /dashboard/notifications.
  const roleNotifications = notifications.filter((n) => n.targetRole === user?.role);
  const unreadCount = roleNotifications.filter((n) => !n.isRead).length;

  // Refresh the drafts count for the badge whenever the developer lands on a
  // dashboard route — keeps the bell honest after a Save as Draft / Submit /
  // Delete without forcing a full reload.
  useEffect(() => {
    if (user?.role !== "developer" && user?.role !== "architect") return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get<unknown[]>("/table-definitions/drafts/me");
        if (cancelled) return;
        setDraftsCount(Array.isArray(data) ? data.length : 0);
      } catch {
        if (!cancelled) setDraftsCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.role, location.pathname]);

  return (
    <header className="bg-white border-b border-slate-200 px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold text-slate-800">
              Data Management Studio
            </h1>
            <p className="text-xs text-slate-500">Redshift Table Management</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {user && (user.role === "developer" || user.role === "architect") && (
            <>
              <button
                onClick={() => navigate("/dashboard/drafts")}
                className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                title="My Drafts"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="hidden sm:inline">Drafts</span>
                {draftsCount !== null && draftsCount > 0 && (
                  <span className="ml-0.5 flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-bold text-white bg-indigo-600 rounded-full">
                    {draftsCount > 99 ? "99+" : draftsCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => navigate("/dashboard/notifications")}
                className="relative p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                title="Notifications"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-red-500 rounded-full">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            </>
          )}

          {user && (
            <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
              <Badge variant="info" dot>
                {user.role}
              </Badge>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600">
                  {user.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .toUpperCase()}
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-slate-700 leading-tight">
                    {user.name}
                  </p>
                  <p className="text-xs text-slate-400 leading-tight">{user.email}</p>
                </div>
              </div>
              <button
                onClick={logout}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title="Sign out"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
