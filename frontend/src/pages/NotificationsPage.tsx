import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useDashboard } from "../context/DashboardContext";
import { TopBar, FooterStatusBar } from "../components/layout";
import { ReviewDrawer } from "../components/review";
import {
  Button,
  Card,
  EmptyState,
  ToastContainer,
} from "../components/common";
import type { Notification } from "../types";

const typeMeta: Record<Notification["type"], { bg: string; color: string; label: string }> = {
  submission: { bg: "bg-indigo-100", color: "text-indigo-600", label: "Submission" },
  approval: { bg: "bg-emerald-100", color: "text-emerald-600", label: "Approval" },
  rejection: { bg: "bg-red-100", color: "text-red-600", label: "Rejection" },
};

const NotificationIcon: React.FC<{ type: Notification["type"]; className: string }> = ({
  type,
  className,
}) => {
  if (type === "submission") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  }
  if (type === "approval") {
    return (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
};

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    clearAllNotifications,
    setReviewingNotification,
    setIsReviewDrawerOpen,
    toasts,
    dismissToast,
  } = useDashboard();

  const roleNotifications = notifications.filter((n) => n.targetRole === user?.role);
  const unreadCount = roleNotifications.filter((n) => !n.isRead).length;

  const handleOpen = (n: Notification) => {
    // Submission notifications carry the table+columns payload — opening
    // routes the architect into the inline review drawer the same way the
    // bell dropdown used to. For approval/rejection notifications there's
    // nothing to act on; we just mark them as read.
    if (n.type === "submission" && n.tableDefinition && user?.role === "architect") {
      setReviewingNotification(n);
      setIsReviewDrawerOpen(true);
    }
    if (!n.isRead) markNotificationRead(n.id);
  };

  return (
    <>
      <div className="min-h-screen flex flex-col bg-slate-50">
        <TopBar />

        <div className="px-6 py-4 bg-white border-b border-slate-200">
          <div className="max-w-[1200px] mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/dashboard")}
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                }
              >
                Back to Dashboard
              </Button>
              <div>
                <h1 className="text-base font-semibold text-slate-800">Notifications</h1>
                <p className="text-xs text-slate-500">
                  {roleNotifications.length} total
                  {unreadCount > 0 ? ` — ${unreadCount} unread` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllNotificationsRead}
                disabled={unreadCount === 0}
              >
                Mark all read
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={clearAllNotifications}
                disabled={roleNotifications.length === 0}
              >
                Clear all
              </Button>
            </div>
          </div>
        </div>

        <main className="flex-1 p-6">
          <div className="max-w-[1200px] mx-auto">
            <Card noPadding>
              {roleNotifications.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No notifications"
                    description="You're all caught up. New activity will show up here and stay until you delete it."
                  />
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {roleNotifications.map((n) => {
                    const meta = typeMeta[n.type];
                    const clickable =
                      n.type === "submission" && n.tableDefinition && user?.role === "architect";
                    return (
                      <li
                        key={n.id}
                        className={`flex items-start gap-4 px-5 py-4 transition-colors ${
                          !n.isRead ? "bg-indigo-50/40" : ""
                        } ${clickable ? "hover:bg-slate-50 cursor-pointer" : ""}`}
                        onClick={clickable ? () => handleOpen(n) : undefined}
                      >
                        <div
                          className={`mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.bg}`}
                        >
                          <NotificationIcon type={n.type} className={`w-4 h-4 ${meta.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-slate-800">{n.title}</span>
                            <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-400">
                              {meta.label}
                            </span>
                            {n.type === "submission" && (
                              <span
                                className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${
                                  n.reviewStatus === "approved"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : n.reviewStatus === "rejected"
                                    ? "bg-red-50 text-red-700 border-red-200"
                                    : "bg-amber-50 text-amber-700 border-amber-200"
                                }`}
                                title={
                                  n.reviewedAt
                                    ? `Reviewed ${new Date(n.reviewedAt).toLocaleString()}`
                                    : undefined
                                }
                              >
                                {n.reviewStatus === "approved"
                                  ? "Approved"
                                  : n.reviewStatus === "rejected"
                                  ? "Rejected"
                                  : "Pending"}
                              </span>
                            )}
                            {!n.isRead && (
                              <span className="w-2 h-2 rounded-full bg-indigo-500" />
                            )}
                          </div>
                          <p className="text-sm text-slate-600 mt-0.5">{n.message}</p>
                          <div className="flex items-center gap-4 mt-1.5">
                            <span className="text-xs text-slate-400">
                              {new Date(n.timestamp).toLocaleString()}
                            </span>
                            {n.submittedBy && (
                              <span className="text-xs text-slate-400">From: {n.submittedBy}</span>
                            )}
                            {clickable && n.reviewStatus !== "pending" && n.reviewStatus !== undefined && (
                              <span className="text-xs font-medium text-slate-500">
                                Click to view (read-only) →
                              </span>
                            )}
                            {clickable && (n.reviewStatus === "pending" || n.reviewStatus === undefined) && (
                              <span className="text-xs font-medium text-indigo-600">
                                Click to review →
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {!n.isRead && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                markNotificationRead(n.id);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                              title="Mark as read"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(n.id);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete notification"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </main>

        <FooterStatusBar />
      </div>
      {/* ReviewDrawer is context-driven; mounting it here lets architects open
          a submission for review directly from the notifications list. */}
      <ReviewDrawer />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
};
