import React, { useState, useEffect } from 'react';
import { Button } from '../common';
import { submitChangeRequest } from '../../api/changeRequests';

interface EditRowDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  rowData: any;
  columns: { name: string; isPrimaryKey: boolean }[];
  tableName: string;
  connectionId: string;
  databaseName?: string;
  schemaName?: string;
  onSuccess: () => void;
}

export const EditRowDrawer: React.FC<EditRowDrawerProps> = ({
  isOpen,
  onClose,
  rowData,
  columns,
  tableName,
  connectionId,
  databaseName,
  schemaName,
  onSuccess,
}) => {
  const [editedData, setEditedData] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rowData) {
      setEditedData({ ...rowData });
    }
  }, [rowData]);

  if (!isOpen || !rowData) return null;

  const handleInputChange = (col: string, val: string) => {
    setEditedData((prev: any) => ({ ...prev, [col]: val }));
  };

  const handleApply = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Determine a pseudo row_id for tracking (use primary key if available, otherwise stringify the first column)
      const pkCol = columns.find(c => c.isPrimaryKey)?.name || columns[0]?.name;
      const rowId = pkCol ? String(rowData[pkCol]) : "unknown";

      await submitChangeRequest({
        connection_id: connectionId,
        database_name: databaseName,
        schema_name: schemaName,
        table_name: tableName,
        row_id: rowId,
        old_data: rowData,
        new_data: editedData,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to submit change request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div 
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40" 
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl z-50 flex flex-col transform transition-transform duration-300">
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h2 className="text-lg font-semibold text-slate-800">Edit Row</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">
              {error}
            </div>
          )}
          
          <div className="space-y-4">
            {columns.map((col) => {
              const isPk = col.isPrimaryKey;
              return (
                <div key={col.name}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {col.name} {isPk && <span className="text-xs text-amber-600 ml-1">(Primary Key)</span>}
                  </label>
                  <input
                    type="text"
                    className={`w-full px-3 py-2 text-sm border rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 
                      ${isPk ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed' : 'bg-white border-slate-300'}`}
                    value={editedData[col.name] !== null && editedData[col.name] !== undefined ? editedData[col.name] : ""}
                    onChange={(e) => handleInputChange(col.name, e.target.value)}
                    disabled={isPk}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex gap-3 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleApply} loading={loading}>
            Apply Changes
          </Button>
        </div>
      </div>
    </>
  );
};
