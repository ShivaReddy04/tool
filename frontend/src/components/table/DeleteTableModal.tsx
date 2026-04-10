import React from "react";
import { useDashboard } from "../../context/DashboardContext";
import { ConfirmDialog } from "../common";

export const DeleteTableModal: React.FC = () => {
  const {
    isDeleteModalOpen,
    setIsDeleteModalOpen,
    tableDefinition,
    tables,
    selectedTableId,
    resetTable,
  } = useDashboard();

  const tableName =
    tableDefinition?.tableName ||
    tables.find((t) => t.id === selectedTableId)?.name ||
    "";

  const handleConfirm = () => {
    // API call will be integrated here
    resetTable();
    setIsDeleteModalOpen(false);
  };

  return (
    <ConfirmDialog
      isOpen={isDeleteModalOpen}
      onClose={() => setIsDeleteModalOpen(false)}
      onConfirm={handleConfirm}
      title="Confirm Table Deletion"
      message={`You are about to delete "${tableName}". This action is irreversible. All columns and associated metadata will be permanently removed.`}
      confirmLabel="Delete Table"
      cancelLabel="Cancel"
      variant="danger"
      requireTypedConfirmation={tableName}
    />
  );
};
