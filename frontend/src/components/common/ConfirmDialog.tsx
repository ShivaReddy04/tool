import React, { useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { TextInput } from "./TextInput";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning";
  requireTypedConfirmation?: string;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  requireTypedConfirmation,
}) => {
  const [typedValue, setTypedValue] = useState("");

  const isConfirmDisabled = requireTypedConfirmation
    ? typedValue !== requireTypedConfirmation
    : false;

  const handleConfirm = () => {
    if (!isConfirmDisabled) {
      onConfirm();
      setTypedValue("");
    }
  };

  const handleClose = () => {
    setTypedValue("");
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "danger" ? "danger" : "primary"}
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              variant === "danger" ? "bg-red-100" : "bg-amber-100"
            }`}
          >
            <svg
              className={`w-5 h-5 ${variant === "danger" ? "text-red-600" : "text-amber-600"}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">{message}</p>
        </div>

        {requireTypedConfirmation && (
          <TextInput
            label={`Type "${requireTypedConfirmation}" to confirm`}
            value={typedValue}
            onChange={(e) => setTypedValue(e.target.value)}
            placeholder={requireTypedConfirmation}
          />
        )}
      </div>
    </Modal>
  );
};
