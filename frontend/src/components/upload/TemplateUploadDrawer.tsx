import React, { useState, useRef } from "react";
import { useDashboard } from "../../context/DashboardContext";
import { Drawer, Button } from "../common";

export const TemplateUploadDrawer: React.FC = () => {
  const { isUploadDrawerOpen, setIsUploadDrawerOpen } = useDashboard();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleClose = () => {
    setIsUploadDrawerOpen(false);
    setSelectedFile(null);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Drawer
      isOpen={isUploadDrawerOpen}
      onClose={handleClose}
      title="Upload Metadata Template"
      subtitle="Upload an Excel or CSV template to import column definitions"
      width="lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!selectedFile}>
            Apply Template
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`
            flex flex-col items-center justify-center py-12 px-6
            border-2 border-dashed rounded-2xl cursor-pointer
            transition-colors duration-150
            ${
              isDragging
                ? "border-indigo-400 bg-indigo-50"
                : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100"
            }
          `}
        >
          <svg
            className={`w-12 h-12 mb-3 ${isDragging ? "text-indigo-500" : "text-slate-400"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="text-sm font-medium text-slate-700 mb-1">
            Drag & drop your file here
          </p>
          <p className="text-xs text-slate-500">
            or{" "}
            <span className="text-indigo-600 font-medium">browse files</span>
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Supports .xlsx, .csv — Max 5MB
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {selectedFile && (
          <div className="p-4 rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatFileSize(selectedFile.size)}
                  </p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFile(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-3">
            Validation Results
          </h4>
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
            <p className="text-sm text-slate-400 text-center">
              {selectedFile
                ? "Validation will run after upload."
                : "Upload a file to see validation results."}
            </p>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-3">
            Preview
          </h4>
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
            <p className="text-sm text-slate-400 text-center">
              {selectedFile
                ? "Preview will be available after validation."
                : "Upload a file to see a preview."}
            </p>
          </div>
        </div>
      </div>
    </Drawer>
  );
};
