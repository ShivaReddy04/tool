import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useDashboard } from "../../context/DashboardContext";
import { ConfirmDialog } from "../common";

export const DeleteTableModal: React.FC = () => {
  const {
    isDeleteModalOpen,
    setIsDeleteModalOpen,
    tableDefinition,
    tables,
    selectedTableId,
    deleteTable,
  } = useDashboard();
  const navigate = useNavigate();
  const location = useLocation();

  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const tableName =
    tableDefinition?.tableName ||
    tables.find((t) => t.id === selectedTableId)?.name ||
    "";

  const handleClose = () => {
    if (isDeleting) return;
    setWarnings(null);
    setIsDeleteModalOpen(false);
  };

  const runDelete = async (force: boolean) => {
    if (!selectedTableId) return;
    setIsDeleting(true);
    const result = await deleteTable(selectedTableId, { force });
    setIsDeleting(false);

    if (result.status === "deleted") {
      setWarnings(null);
      setIsDeleteModalOpen(false);
      // If we're on the per-table view page, the table no longer exists —
      // route back to the dashboard so the user lands somewhere coherent.
      if (location.pathname.startsWith("/dashboard/tables/")) {
        navigate("/dashboard");
      }
      return;
    }

    if (result.status === "warning") {
      setWarnings(result.warnings || ["This table is connected to other entities."]);
      return;
    }
    // status === 'error': toast already shown by deleteTable; keep modal open.
  };

  // Two-stage UX:
  //   1) initial confirm → POST without force
  //   2) if backend returns warnings → second confirm → POST with force
  if (warnings && warnings.length > 0) {
    return (
      <ConfirmDialog
        isOpen={isDeleteModalOpen}
        onClose={handleClose}
        onConfirm={() => runDelete(true)}
        title="Table is mapped to other entities"
        message={
          `${warnings.join(" ")} ` +
          `Proceeding will remove the table from the application only. ` +
          `The physical database table will NOT be deleted.`
        }
        confirmLabel={isDeleting ? "Removing..." : "Remove Anyway"}
        cancelLabel="Cancel"
        variant="warning"
      />
    );
  }

  return (
    <ConfirmDialog
      isOpen={isDeleteModalOpen}
      onClose={handleClose}
      onConfirm={() => runDelete(false)}
      title="Remove Table from Application"
      message={
        "Are you sure you want to remove this table from the application? " +
        "This will not delete the actual database table."
      }
      confirmLabel={isDeleting ? "Removing..." : "Remove from App"}
      cancelLabel="Cancel"
      variant="danger"
      requireTypedConfirmation={tableName}
    />
  );
};
