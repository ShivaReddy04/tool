import React, { useMemo, useState } from "react";
import { useDashboard } from "../../context/DashboardContext";
import { Card, Button } from "../common";
import type { ColumnAction, ColumnDefinition } from "../../types";
import { validateColumnDefault } from "../../utils/validation";
import { COLUMN_FIELDS, type ColumnFieldSpec } from "./columnFields";

const actionRowStyles: Record<ColumnAction, string> = {
  "No Change": "",
  Modify: "bg-amber-50 border-l-4 border-l-amber-400",
  Add: "bg-emerald-50 border-l-4 border-l-emerald-400",
  Drop: "bg-red-50 border-l-4 border-l-red-400 line-through opacity-60",
};

const baseCellClass =
  "w-full bg-transparent px-2 py-1 text-xs text-slate-800 border border-transparent rounded focus:bg-white focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 focus:outline-none";

interface EditableCellProps {
  field: ColumnFieldSpec;
  col: ColumnDefinition;
  isDuplicate: boolean;
  defaultError?: string;
  onUpdate: (id: string, patch: Partial<ColumnDefinition>) => void;
}

const EditableCell: React.FC<EditableCellProps> = ({ field, col, isDuplicate, defaultError, onUpdate }) => {
  const value = field.get(col);
  const commit = (v: string | number | boolean) => {
    const next = field.set(col, v);
    // Patch only the fields the spec actually touched, so context's
    // updateColumn auto-Modify-promote logic sees the real change set.
    const patch: Partial<ColumnDefinition> = {};
    (Object.keys(next) as (keyof ColumnDefinition)[]).forEach((k) => {
      if ((next as any)[k] !== (col as any)[k]) {
        (patch as any)[k] = (next as any)[k];
      }
    });
    if (Object.keys(patch).length > 0) onUpdate(col.id, patch);
  };

  const hasDefaultError = field.key === "defaultValue" && !!defaultError;
  const errorClass =
    (field.key === "columnName" && (isDuplicate || !col.columnName.trim())) || hasDefaultError
      ? "border-red-300 bg-red-50"
      : "";

  if (field.kind === "checkbox") {
    return (
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => commit(e.target.checked)}
        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        aria-label={field.label}
      />
    );
  }
  if (field.kind === "select") {
    return (
      <select
        value={String(value)}
        onChange={(e) => commit(e.target.value)}
        className={`${baseCellClass} ${errorClass}`}
        aria-label={field.label}
      >
        {field.options!.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.kind === "number") {
    return (
      <input
        type="number"
        value={value as number}
        onChange={(e) => commit(Number(e.target.value) || 0)}
        className={`${baseCellClass} ${errorClass}`}
        aria-label={field.label}
      />
    );
  }
  return (
    <input
      type="text"
      value={String(value)}
      onChange={(e) => commit(e.target.value)}
      className={`${baseCellClass} ${errorClass}`}
      aria-label={field.label}
      placeholder={field.required ? "required" : ""}
      title={
        field.key === "columnName" && isDuplicate
          ? "Duplicate column name"
          : hasDefaultError
          ? defaultError
          : undefined
      }
    />
  );
};

export const ColumnDataGrid: React.FC = () => {
  const { columns, updateColumn, addColumn } = useDashboard();
  const [searchTerm, setSearchTerm] = useState("");

  const duplicateColumnNames = useMemo(() => {
    const seen = new Map<string, number>();
    const dups = new Set<string>();
    columns.forEach((c) => {
      const name = c.columnName.trim().toLowerCase();
      if (!name) return;
      const count = (seen.get(name) || 0) + 1;
      seen.set(name, count);
      if (count > 1) dups.add(name);
    });
    return dups;
  }, [columns]);

  // Per-column default-value validation — mirrors the backend check in
  // saveTableDefinition. We catch bad defaults here so the developer sees a
  // red ring on the cell immediately instead of discovering it when the
  // architect's approve fails apply on the target cluster.
  const defaultErrors = useMemo(() => {
    const map = new Map<string, string>();
    columns.forEach((c) => {
      const r = validateColumnDefault(c.defaultValue, c.dataType, `Column "${c.columnName || "?"}"`);
      if (!r.valid && r.error) map.set(c.id, r.error);
    });
    return map;
  }, [columns]);

  const filteredColumns = columns.filter((col) =>
    col.columnName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (columns.length === 0) {
    return null;
  }

  return (
    <Card
      title="Column Management"
      subtitle={`${columns.length} columns — edit any cell to modify`}
      noPadding
    >
      <div className="px-4 py-3 border-b border-slate-100">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search columns..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
      </div>

      <div className="overflow-auto max-h-[60vh]">
        <table className="border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th
                className="sticky top-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600 border-b border-slate-200"
                style={{ minWidth: 40, width: 40 }}
              >
                #
              </th>
              {COLUMN_FIELDS.map((f) => (
                <th
                  key={f.key}
                  className="sticky top-0 z-10 bg-slate-50 text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap border-b border-slate-200"
                  style={{ minWidth: f.width, width: f.width }}
                >
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredColumns.map((col, rowIdx) => {
              const isDup =
                !!col.columnName.trim() &&
                duplicateColumnNames.has(col.columnName.trim().toLowerCase());
              return (
                <tr
                  key={col.id}
                  className={`border-b border-slate-50 hover:bg-slate-50/40 ${actionRowStyles[col.action]}`}
                >
                  <td className="px-3 py-1.5 text-slate-500 align-middle">
                    {rowIdx + 1}
                  </td>
                  {COLUMN_FIELDS.map((f) => {
                    const alignCenter = f.kind === "checkbox";
                    return (
                      <td
                        key={f.key}
                        className={`px-1 py-1 align-middle ${alignCenter ? "text-center" : ""}`}
                        style={{ minWidth: f.width, width: f.width }}
                      >
                        <EditableCell
                          field={f}
                          col={col}
                          isDuplicate={isDup}
                          defaultError={defaultErrors.get(col.id)}
                          onUpdate={updateColumn}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-3 border-t border-slate-100">
        <Button
          variant="ghost"
          size="sm"
          onClick={addColumn}
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          }
        >
          Add Column
        </Button>
      </div>
    </Card>
  );
};
