import React from "react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && (
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-slate-700 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm mb-6">{description}</p>
      {action && <div className="flex items-center gap-3">{action}</div>}
    </div>
  );
};
