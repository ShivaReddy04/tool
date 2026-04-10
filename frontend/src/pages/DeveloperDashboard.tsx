import React from "react";
import { DashboardLayout } from "../components/layout";
import { EnvironmentPanel } from "../components/environment";
import {
  TableToolbar,
  TablePropertiesPanel,
  CreateTableDrawer,
  DeleteTableModal,
} from "../components/table";
import { ColumnDataGrid, ColumnDetailPanel } from "../components/columns";

import { ReviewDrawer } from "../components/review";
import { EmptyState, Card, Button, ToastContainer } from "../components/common";
import { useDashboard } from "../context/DashboardContext";

const CenterPanel: React.FC = () => {
  const { selectedClusterId, selectedSchemaId, selectedTableId, columns } =
    useDashboard();

  if (!selectedClusterId || !selectedSchemaId) {
    return (
      <Card>
        <EmptyState
          icon={
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
            </svg>
          }
          title="Configure Environment"
          description="Select a cluster and schema from the left panel to begin managing tables."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card
        title="Table Management"
        subtitle="Select or create a table"
        icon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        }
      >
        <TableToolbar />
      </Card>

      {selectedTableId && columns.length > 0 ? (
        <ColumnDataGrid />
      ) : selectedTableId ? (
        <Card>
          <EmptyState
            title="Loading Table"
            description="Fetching table structure..."
          />
        </Card>
      ) : (
        <Card>
          <EmptyState
            icon={
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
            }
            title="No Table Selected"
            description="Select a table from the dropdown above or create a new one to begin editing columns."
            action={
              <Button variant="outline" size="sm">
                + New Table
              </Button>
            }
          />
        </Card>
      )}
    </div>
  );
};

const RightPanel: React.FC = () => {
  const { rightPanelMode, selectedColumnId } = useDashboard();

  if (rightPanelMode === "column-detail" && selectedColumnId) {
    return <ColumnDetailPanel />;
  }

  return <TablePropertiesPanel />;
};

export const DeveloperDashboard: React.FC = () => {
  const { toasts, dismissToast } = useDashboard();

  return (
    <>
      <DashboardLayout
        leftPanel={<EnvironmentPanel />}
        centerPanel={<CenterPanel />}
        rightPanel={<RightPanel />}
      />
      <CreateTableDrawer />
      <DeleteTableModal />
      <ReviewDrawer />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
};
