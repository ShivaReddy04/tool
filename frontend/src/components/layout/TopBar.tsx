import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useDashboard } from "../../context/DashboardContext";
import { Badge, Button } from "../common";
import type { Notification } from "../../types";

const notifTypeIcon: Record<Notification["type"], { bg: string; color: string }> = {
  submission: { bg: "bg-indigo-100", color: "text-indigo-600" },
  approval: { bg: "bg-emerald-100", color: "text-emerald-600" },
  rejection: { bg: "bg-red-100", color: "text-red-600" },
};

const NotificationPanel: React.FC<{
  roleNotifications: Notification[];
  onNotificationClick: (n: Notification) => void;
}> = ({ roleNotifications, onNotificationClick }) => {
  const { markAllNotificationsRead } = useDashboard();

  if (roleNotifications.length === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-slate-400">No notifications yet.</p>
      </div>
    );
  }

  return (
    <div className="max-h-96 overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Notifications
        </span>
        <button
          onClick={markAllNotificationsRead}
          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
        >
          Mark all read
        </button>
      </div>
      {roleNotifications.map((n) => {
        const icon = notifTypeIcon[n.type];
        return (
          <button
            key={n.id}
            onClick={() => onNotificationClick(n)}
            className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${
              !n.isRead ? "bg-indigo-50/50" : ""
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${icon.bg}`}>
                {n.type === "submission" && (
                  <svg className={`w-4 h-4 ${icon.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
                {n.type === "approval" && (
                  <svg className={`w-4 h-4 ${icon.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {n.type === "rejection" && (
                  <svg className={`w-4 h-4 ${icon.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-800 truncate">{n.title}</p>
                  {!n.isRead && (
                    <div className="w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0" />
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {new Date(n.timestamp).toLocaleString()}
                </p>
                {n.type === "submission" && n.tableDefinition && (
                  <span className="inline-block mt-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700">
                    Click to review →
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export const TopBar: React.FC = () => {
  const { user, logout } = useAuth();
  const {
    notifications,
    markNotificationRead,
    setReviewingNotification,
    setIsReviewDrawerOpen,
  } = useDashboard();
  const [showNotifications, setShowNotifications] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Filter notifications by current user's role
  const roleNotifications = notifications.filter(
    (n) => n.targetRole === user?.role
  );
  const unreadCount = roleNotifications.filter((n) => !n.isRead).length;

  const handleNotificationClick = (n: Notification) => {
    // For submission notifications with table data, open ReviewDrawer (Architect)
    if (n.type === "submission" && n.tableDefinition && user?.role === "architect") {
      setReviewingNotification(n);
      setIsReviewDrawerOpen(true);
      markNotificationRead(n.id);
      setShowNotifications(false);
    } else {
      // For approval/rejection notifications, just mark as read
      markNotificationRead(n.id);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    if (showNotifications) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showNotifications]);

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
          {/* Notification Bell — visible to Developer and Architect */}
          {user && (user.role === "developer" || user.role === "architect") && (
            <div className="relative" ref={panelRef}>
              <button
                onClick={() => setShowNotifications((prev) => !prev)}
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

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-xl border border-slate-200 z-50">
                  <NotificationPanel
                    roleNotifications={roleNotifications}
                    onNotificationClick={handleNotificationClick}
                  />
                </div>
              )}
            </div>
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
