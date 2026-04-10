import React from "react";
import { useDashboard } from "../../context/DashboardContext";

export const FooterStatusBar: React.FC = () => {
  const { selectedClusterId, selectedSchemaId, columns } = useDashboard();

  const modifiedCount = columns.filter((c) => c.action !== "No Change").length;

  return (
    <footer className="bg-white border-t border-slate-200 px-6 py-2">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Connected
          </span>
          {selectedClusterId && (
            <span>
              Cluster: <span className="font-medium text-slate-700">{selectedClusterId}</span>
            </span>
          )}
          {selectedSchemaId && (
            <span>
              Schema: <span className="font-medium text-slate-700">{selectedSchemaId}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {modifiedCount > 0 && (
            <span className="text-amber-600 font-medium">
              {modifiedCount} pending change{modifiedCount !== 1 ? "s" : ""}
            </span>
          )}
          <span>Columns: {columns.length}</span>
        </div>
      </div>
    </footer>
  );
};
