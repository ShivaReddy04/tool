import React from "react";
import { DashboardLayout } from "../components/layout";
import { EnvironmentPanel } from "../components/environment";
import {
  TableToolbar,
  TablePropertiesPanel,
  CreateTableDrawer,
  DeleteTableModal,
} from "../components/table";

import { ReviewDrawer } from "../components/review";
import { EmptyState, Card, ToastContainer } from "../components/common";
import { useDashboard } from "../context/DashboardContext";

const CenterPanel: React.FC = () => {
  const { selectedClusterId, selectedSchemaId } = useDashboard();

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
  );
};

export const DeveloperDashboard: React.FC = () => {
  const { toasts, dismissToast } = useDashboard();

  return (
    <>
      <DashboardLayout
        leftPanel={<EnvironmentPanel />}
        centerPanel={<CenterPanel />}
        rightPanel={<TablePropertiesPanel />}
      />
      <CreateTableDrawer />
      <DeleteTableModal />
      <ReviewDrawer />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
};
