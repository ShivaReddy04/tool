import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useDashboard } from "../../context/DashboardContext";
import { Button } from "../common";
import { TablePickerDropdown } from "./TablePickerDropdown";

export const TableToolbar: React.FC = () => {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const {
    tables,
    selectedTableId,
    setSelectedTableId,
    setIsDeleteModalOpen,
    setCurrentStep,
    refreshTable,
  } = useDashboard();

  const pendingCount = tables.filter(
    (t) => t.status === "draft" || t.status === "submitted" || t.status === "rejected",
  ).length;

  // Picking a table keeps you on /dashboard — the edit view renders inline
  // when tableDefinition is populated. No navigation.
  const handleTableChange = (value: string) => {
    setSelectedTableId(value);
    if (value) setCurrentStep(3);
  };

  return (
    <div className="space-y-3">
      <TablePickerDropdown
        label="Select Table"
        tables={tables}
        value={selectedTableId}
        onChange={handleTableChange}
        placeholder="Choose a table"
      />

      {pendingCount > 0 && (
        <p className="text-xs text-amber-700">
          {pendingCount} table{pendingCount === 1 ? "" : "s"} with pending
          changes awaiting architect approval.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!selectedTableId}
          onClick={refreshTable}
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          }
        >
          Refresh Table
        </Button>

        <Button
          variant="primary"
          size="sm"
          onClick={() => navigate("/dashboard/new-table")}
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          }
        >
          New Table
        </Button>

        {(hasRole("developer") || hasRole("architect") || hasRole("admin")) && (
          <Button
            variant="danger"
            size="sm"
            disabled={!selectedTableId}
            onClick={() => setIsDeleteModalOpen(true)}
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            }
          >
            Remove Table
          </Button>
        )}
      </div>
    </div>
  );
};
