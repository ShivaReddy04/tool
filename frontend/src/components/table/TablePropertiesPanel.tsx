import React from "react";
import { useAuth } from "../../context/AuthContext";
import { useDashboard } from "../../context/DashboardContext";
import { Card, Button, Badge } from "../common";

export const TablePropertiesPanel: React.FC = () => {
  const { hasRole } = useAuth();
  const { tableDefinition, columns, submissionStatus } = useDashboard();

  if (!tableDefinition) {
    return (
      <Card title="Table Properties">
        <p className="text-sm text-slate-400 text-center py-8">
          Select a table to view its properties.
        </p>
      </Card>
    );
  }

  const properties = [
    { label: "Table Name", value: tableDefinition.tableName },
    { label: "Entity Logical Name", value: tableDefinition.entityLogicalName },
    { label: "Distribution Style", value: tableDefinition.distributionStyle },
    { label: "Keys", value: tableDefinition.keys },
    { label: "Vertical Name", value: tableDefinition.verticalName },
    { label: "Total Columns", value: columns.length.toString() },
  ];

  const statusVariant: Record<string, "neutral" | "info" | "success" | "danger"> = {
    draft: "neutral",
    submitted: "info",
    approved: "success",
    rejected: "danger",
  };

  return (
    <Card
      title="Table Properties"
      subtitle={tableDefinition.tableName}
      icon={
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      }
      headerAction={
        hasRole("architect") ? (
          <Button variant="ghost" size="sm">
            Edit
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-3">
        {properties.map((prop) => (
          <div key={prop.label} className="flex items-start justify-between gap-4">
            <span className="text-xs text-slate-500 flex-shrink-0">{prop.label}</span>
            <span className="text-xs font-medium text-slate-700 text-right">
              {prop.value || "—"}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-100">
          <span className="text-xs text-slate-500">Submission Status</span>
          <Badge variant={statusVariant[submissionStatus] ?? "neutral"}>
            {submissionStatus.charAt(0).toUpperCase() + submissionStatus.slice(1)}
          </Badge>
        </div>
      </div>
    </Card>
  );
};
