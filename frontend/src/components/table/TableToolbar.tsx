import React from "react";
import { useAuth } from "../../context/AuthContext";
import { useDashboard } from "../../context/DashboardContext";
import { Select, Button } from "../common";

export const TableToolbar: React.FC = () => {
  const { hasRole } = useAuth();
  const {
    tables,
    selectedTableId,
    setSelectedTableId,
    setIsCreateTableDrawerOpen,
    setIsDeleteModalOpen,
    setCurrentStep,
    refreshTable,
  } = useDashboard();

  const tableOptions = tables.map((t) => ({
    value: t.id,
    label: t.name,
  }));

  const handleTableChange = (value: string) => {
    setSelectedTableId(value);
    if (value) {
      setCurrentStep(3);
    }
  };

  return (
    <div className="space-y-3">
      <Select
        label="Select Table"
        options={tableOptions}
        value={selectedTableId}
        onChange={handleTableChange}
        placeholder="Choose a table"
      />

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
          onClick={() => setIsCreateTableDrawerOpen(true)}
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          }
        >
          New Table
        </Button>

        {hasRole("architect") && (
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
