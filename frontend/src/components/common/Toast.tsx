import React, { useEffect, useState } from "react";

export interface ToastData {
  id: string;
  variant: "success" | "info" | "error";
  message: string;
}

interface ToastItemProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

const variantStyles: Record<ToastData["variant"], { bg: string; icon: string; border: string }> = {
  success: { bg: "bg-emerald-50", icon: "text-emerald-500", border: "border-emerald-200" },
  info: { bg: "bg-indigo-50", icon: "text-indigo-500", border: "border-indigo-200" },
  error: { bg: "bg-red-50", icon: "text-red-500", border: "border-red-200" },
};

const icons: Record<ToastData["variant"], React.ReactNode> = {
  success: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const ToastItem: React.FC<ToastItemProps> = ({ toast, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);
  const style = variantStyles[toast.variant];

  useEffect(() => {
    const timer = setTimeout(() => setIsExiting(true), 3500);
    const removeTimer = setTimeout(() => onDismiss(toast.id), 4000);
    return () => {
      clearTimeout(timer);
      clearTimeout(removeTimer);
    };
  }, [toast.id, onDismiss]);

  return (
    <div
      className={`
        flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg
        transition-all duration-300
        ${style.bg} ${style.border}
        ${isExiting ? "opacity-0 translate-x-4" : "opacity-100 translate-x-0"}
      `}
    >
      <span className={style.icon}>{icons[toast.variant]}</span>
      <p className="text-sm font-medium text-slate-700 flex-1">{toast.message}</p>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-slate-400 hover:text-slate-600 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

interface ToastContainerProps {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
};
