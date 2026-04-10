import React from "react";

interface CardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  className?: string;
  headerAction?: React.ReactNode;
  noPadding?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  title,
  subtitle,
  icon,
  className = "",
  headerAction,
  noPadding = false,
}) => {
  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border border-slate-200 ${className}`}
    >
      {(title || headerAction) && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600">
                {icon}
              </div>
            )}
            <div>
              {title && (
                <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
              )}
              {subtitle && (
                <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      <div className={noPadding ? "" : "p-6"}>{children}</div>
    </div>
  );
};
