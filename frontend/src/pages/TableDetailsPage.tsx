import React, { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useDashboard } from "../context/DashboardContext";
import { TopBar, FooterStatusBar } from "../components/layout";
import { Card, Button, Badge, EmptyState, ToastContainer } from "../components/common";
import { ColumnDataGrid, ColumnDetailPanel, RowDetailPanel } from "../components/columns";
import { ReviewDrawer } from "../components/review";
import { CreateTableDrawer, DeleteTableModal } from "../components/table";

const TableMetadataSection: React.FC = () => {
  const { hasRole } = useAuth();
  const { tableDefinition, columns, submissionStatus } = useDashboard();

  if (!tableDefinition) return null;

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
      title="Table Metadata"
      subtitle={tableDefinition.tableName}
      icon={
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      }
      headerAction={
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant[submissionStatus] ?? "neutral"}>
            {submissionStatus.charAt(0).toUpperCase() + submissionStatus.slice(1)}
          </Badge>
          {hasRole("architect") ? (
            <Button variant="ghost" size="sm">
              Edit
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {properties.map((prop) => (
          <div key={prop.label} className="flex flex-col">
            <span className="text-xs text-slate-500">{prop.label}</span>
            <span className="text-sm font-medium text-slate-800 mt-1">
              {prop.value || "—"}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
};

const SidePanel: React.FC = () => {
  const { rightPanelMode, selectedColumnId } = useDashboard();

  if (rightPanelMode === "column-detail" && selectedColumnId) {
    return <ColumnDetailPanel />;
  }

  if (rightPanelMode === "row-detail") {
    return <RowDetailPanel />;
  }

  return null;
};

export const TableDetailsPage: React.FC = () => {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const {
    selectedTableId,
    setSelectedTableId,
    tableDefinition,
    rightPanelMode,
    toasts,
    dismissToast,
  } = useDashboard();

  useEffect(() => {
    if (tableId) {
      const decoded = decodeURIComponent(tableId);
      if (decoded !== selectedTableId) {
        setSelectedTableId(decoded);
      }
    }
  }, [tableId, selectedTableId, setSelectedTableId]);

  const sidePanelActive = rightPanelMode === "column-detail" || rightPanelMode === "row-detail";

  return (
    <>
      <div className="min-h-screen flex flex-col bg-slate-50">
        <TopBar />

        <div className="px-6 py-4 bg-white border-b border-slate-200">
          <div className="max-w-[1600px] mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/dashboard")}
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                }
              >
                Back to Dashboard
              </Button>
              <div className="text-sm text-slate-500">
                {tableDefinition?.tableName ?? "Table"}
              </div>
            </div>
          </div>
        </div>

        <main className="flex-1 p-6">
          <div className={`max-w-[1600px] mx-auto grid grid-cols-1 gap-6 ${sidePanelActive ? "lg:grid-cols-12" : ""}`}>
            <div className={sidePanelActive ? "lg:col-span-8 space-y-6" : "space-y-6"}>
              {tableDefinition ? (
                <>
                  <TableMetadataSection />
                  <ColumnDataGrid />
                </>
              ) : (
                <Card>
                  <EmptyState
                    title="Loading Table"
                    description="Fetching table structure..."
                  />
                </Card>
              )}
            </div>
            {sidePanelActive && (
              <div className="lg:col-span-4">
                <SidePanel />
              </div>
            )}
          </div>
        </main>

        <FooterStatusBar />
      </div>
      <CreateTableDrawer />
      <DeleteTableModal />
      <ReviewDrawer />
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </>
  );
};
