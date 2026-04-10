import React from "react";

type BadgeVariant = "info" | "success" | "warning" | "danger" | "neutral";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  info: "bg-blue-50 text-blue-700 border-blue-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  danger: "bg-red-50 text-red-700 border-red-200",
  neutral: "bg-slate-50 text-slate-600 border-slate-200",
};

const dotStyles: Record<BadgeVariant, string> = {
  info: "bg-blue-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  neutral: "bg-slate-400",
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "neutral",
  dot = false,
}) => {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-0.5
        text-xs font-medium rounded-full border
        ${variantStyles[variant]}
      `}
    >
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full ${dotStyles[variant]}`} />
      )}
      {children}
    </span>
  );
};
