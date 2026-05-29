import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import {
  columnToServer,
  useDashboard,
} from "../../context/DashboardContext";
import api from "../../api/client";
import { Button, Badge, ConfirmDialog } from "../common";
import { validateColumnDefault } from "../../utils/validation";
import type {
  ColumnAction,
  ColumnDefinition,
  PreviousColumnSnapshot,
} from "../../types";

/* ────────────────────────────────────────────────────────────────────────
   Types
   ──────────────────────────────────────────────────────────────────────── */

type ActionFilter = "all" | ColumnAction;
type SortKey = "columnName" | "action" | "dataType";
type SortDir = "asc" | "desc";
type Decision = "approved" | "rejected";

interface RowDecision {
  decision: Decision | null;
  comment: string;
}

/* ────────────────────────────────────────────────────────────────────────
   Static config
   ──────────────────────────────────────────────────────────────────────── */

const actionRowAccent: Record<ColumnAction, string> = {
  "No Change": "",
  Modify: "border-l-4 border-l-blue-400",
  Add: "border-l-4 border-l-emerald-400",
  Drop: "border-l-4 border-l-red-400",
};

const actionBadgeVariant: Record<
  ColumnAction,
  "neutral" | "info" | "success" | "danger"
> = {
  "No Change": "neutral",
  Modify: "info",
  Add: "success",
  Drop: "danger",
};

const decisionTone: Record<Decision, string> = {
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

const statusBadge: Record<
  string,
  "neutral" | "info" | "success" | "danger"
> = {
  draft: "neutral",
  submitted: "info",
  approved: "success",
  rejected: "danger",
  applied: "success",
  processed: "success",
};

const DATA_TYPE_OPTIONS = [
  "SMALLINT",
  "INTEGER",
  "BIGINT",
  "DECIMAL",
  "REAL",
  "DOUBLE PRECISION",
  "BOOLEAN",
  "CHAR",
  "VARCHAR",
  "DATE",
  "TIMESTAMP",
  "TIMESTAMPTZ",
  "SUPER",
];

const CLASSIFICATION_OPTIONS = [
  "Public",
  "Internal",
  "Confidential",
  "PII",
  "Restricted",
];

const SQL_KEYWORDS = new Set([
  "CREATE",
  "TABLE",
  "ALTER",
  "ADD",
  "DROP",
  "COLUMN",
  "SCHEMA",
  "IF",
  "NOT",
  "EXISTS",
  "NULL",
  "DEFAULT",
  "PRIMARY",
  "KEY",
  "REFERENCES",
  "ON",
  "DELETE",
  "UPDATE",
  "SET",
  "TYPE",
  "USING",
  "WITH",
  "CONSTRAINT",
  "UNIQUE",
  "CHECK",
  "AND",
  "OR",
]);

/* ────────────────────────────────────────────────────────────────────────
   Utilities
   ──────────────────────────────────────────────────────────────────────── */

const toBoolNullable = (v: unknown): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toUpperCase() === "YES";
  return true;
};

const detectChangedFields = (
  prev: PreviousColumnSnapshot | undefined,
  col: ColumnDefinition,
): Array<{ field: string; before: string; after: string }> => {
  if (!prev) return [];
  const diffs: Array<{ field: string; before: string; after: string }> = [];
  if ((prev.data_type || "").toLowerCase() !== (col.dataType || "").toLowerCase()) {
    diffs.push({ field: "Data Type", before: prev.data_type || "—", after: col.dataType || "—" });
  }
  const prevNullable = toBoolNullable(prev.is_nullable);
  if (prevNullable !== col.isNullable) {
    diffs.push({
      field: "Nullable",
      before: prevNullable ? "YES" : "NO",
      after: col.isNullable ? "YES" : "NO",
    });
  }
  const prevDefault = (prev.column_default || "").trim();
  const newDefault = (col.defaultValue || "").trim();
  if (prevDefault !== newDefault) {
    diffs.push({ field: "Default", before: prevDefault || "—", after: newDefault || "—" });
  }
  return diffs;
};

/* ────────────────────────────────────────────────────────────────────────
   Pure presentational pieces
   ──────────────────────────────────────────────────────────────────────── */

const SummaryCard: React.FC<{
  label: string;
  count: number;
  tone: "emerald" | "blue" | "red" | "slate";
  active: boolean;
  onClick: () => void;
}> = ({ label, count, tone, active, onClick }) => {
  const tones: Record<typeof tone, { bg: string; border: string; dot: string; text: string }> = {
    emerald: { bg: "bg-emerald-50", border: "border-emerald-200", dot: "bg-emerald-500", text: "text-emerald-700" },
    blue: { bg: "bg-blue-50", border: "border-blue-200", dot: "bg-blue-500", text: "text-blue-700" },
    red: { bg: "bg-red-50", border: "border-red-200", dot: "bg-red-500", text: "text-red-700" },
    slate: { bg: "bg-slate-50", border: "border-slate-200", dot: "bg-slate-400", text: "text-slate-600" },
  };
  const t = tones[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 min-w-[140px] text-left ${t.bg} border ${t.border} rounded-xl px-4 py-3 transition-all ${
        active ? "ring-2 ring-indigo-400 shadow-sm" : "hover:shadow-sm"
      }`}
      aria-pressed={active}
    >
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${t.dot}`} />
        <span className={`text-xs font-medium uppercase tracking-wide ${t.text}`}>{label}</span>
      </div>
      <div className={`mt-2 text-2xl font-semibold ${t.text}`}>{count}</div>
    </button>
  );
};

const SqlLine: React.FC<{ text: string; highlighted: boolean }> = ({ text, highlighted }) => {
  // Tokenize once per render — schemas with hundreds of statements still render
  // in microseconds because the highlighter is allocation-light.
  const tokens = useMemo(() => {
    const out: Array<{ kind: "kw" | "str" | "num" | "punct" | "text"; v: string }> = [];
    // Order matters: strings → numbers → identifiers → punctuation.
    const re = /'([^']*)'|("([^"]*)")|(\b\d+(?:\.\d+)?\b)|(\w+)|([(),;])|(\s+)|([^\s\w(),;'"]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m[0].startsWith("'")) out.push({ kind: "str", v: m[0] });
      else if (m[0].startsWith('"')) out.push({ kind: "text", v: m[0] });
      else if (m[4]) out.push({ kind: "num", v: m[4] });
      else if (m[5]) {
        out.push({
          kind: SQL_KEYWORDS.has(m[5].toUpperCase()) ? "kw" : "text",
          v: m[5],
        });
      } else if (m[6]) out.push({ kind: "punct", v: m[6] });
      else out.push({ kind: "text", v: m[0] });
    }
    return out;
  }, [text]);

  return (
    <div className={`py-0.5 px-1 ${highlighted ? "bg-yellow-500/20 border-l-2 border-yellow-400" : ""}`}>
      {tokens.map((t, i) => {
        if (t.kind === "kw") return <span key={i} className="text-indigo-300 font-semibold">{t.v}</span>;
        if (t.kind === "str") return <span key={i} className="text-emerald-300">{t.v}</span>;
        if (t.kind === "num") return <span key={i} className="text-amber-300">{t.v}</span>;
        if (t.kind === "punct") return <span key={i} className="text-slate-400">{t.v}</span>;
        return <span key={i} className="text-slate-100">{t.v}</span>;
      })}
    </div>
  );
};

/* ────────────────────────────────────────────────────────────────────────
   Main component
   ──────────────────────────────────────────────────────────────────────── */

export const ReviewDrawer: React.FC = () => {
  const { user } = useAuth();
  const {
    isReviewDrawerOpen,
    setIsReviewDrawerOpen,
    reviewingNotification,
    setReviewingNotification,
    approveSubmission,
    rejectSubmission,
    addToast,
  } = useDashboard();

  const tableDef = reviewingNotification?.tableDefinition ?? null;
  const initialColumns = reviewingNotification?.columns ?? [];
  const ddlStatements = reviewingNotification?.ddlStatements ?? [];
  const dbType = reviewingNotification?.dbType;

  /* ── working state ──────────────────────────────────────────────────── */
  const [localColumns, setLocalColumns] = useState<ColumnDefinition[]>([]);
  const [originalColumns, setOriginalColumns] = useState<ColumnDefinition[]>([]);
  const [decisions, setDecisions] = useState<Record<string, RowDecision>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ColumnDefinition | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("columnName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [focusedColumnId, setFocusedColumnId] = useState<string | null>(null);
  const [ddlExpanded, setDdlExpanded] = useState(true);
  const [ddlFullScreen, setDdlFullScreen] = useState(false);
  const [ddlCopied, setDdlCopied] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [activeTab, setActiveTab] = useState<"columns" | "compare" | "ddl">("columns");
  const [compareTargetId, setCompareTargetId] = useState<string | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [propsExpanded, setPropsExpanded] = useState(true);

  /* Reset working state every time a new submission is loaded so a previous
     review's edits/decisions don't leak into the next one. */
  useEffect(() => {
    if (!reviewingNotification) return;
    setLocalColumns(initialColumns.map((c) => ({ ...c })));
    setOriginalColumns(initialColumns.map((c) => ({ ...c })));
    setDecisions({});
    setEditingId(null);
    setEditDraft(null);
    setEditError(null);
    setSelectedIds(new Set());
    setSearch("");
    setActionFilter("all");
    setSortKey("columnName");
    setSortDir("asc");
    setFocusedColumnId(null);
    setCompareTargetId(null);
    setActiveTab("columns");
    setRejectReason("");
    setDdlExpanded(true);
    setDdlFullScreen(false);
    setExpandedRowId(null);
    setPropsExpanded(true);
  }, [reviewingNotification?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Esc closes the full-screen review like every other modal in the app. */
  useEffect(() => {
    if (!isReviewDrawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [isReviewDrawerOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevByName = useMemo(
    () =>
      new Map(
        (reviewingNotification?.previousColumns ?? []).map((p) => [
          p.column_name.toLowerCase(),
          p,
        ]),
      ),
    [reviewingNotification?.previousColumns],
  );

  const counts = useMemo(() => {
    const c = { added: 0, modified: 0, dropped: 0, unchanged: 0 };
    for (const col of localColumns) {
      if (col.action === "Add") c.added += 1;
      else if (col.action === "Modify") c.modified += 1;
      else if (col.action === "Drop") c.dropped += 1;
      else c.unchanged += 1;
    }
    return c;
  }, [localColumns]);

  const filteredColumns = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = localColumns.filter((c) => {
      if (actionFilter !== "all" && c.action !== actionFilter) return false;
      if (!term) return true;
      const haystack = [
        c.columnName,
        c.attributeName,
        c.dataType,
        c.dataDomain,
        c.dataClassification,
        c.attributeDefinition,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = String((a as any)[sortKey] ?? "").toLowerCase();
      const bv = String((b as any)[sortKey] ?? "").toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [localColumns, search, actionFilter, sortKey, sortDir]);

  const focusedColumn = useMemo(
    () => localColumns.find((c) => c.id === focusedColumnId) || null,
    [localColumns, focusedColumnId],
  );

  const compareColumn = useMemo(
    () => localColumns.find((c) => c.id === compareTargetId) || null,
    [localColumns, compareTargetId],
  );

  const compareDiffs = useMemo(() => {
    if (!compareColumn) return [];
    const prev = prevByName.get(compareColumn.columnName.toLowerCase());
    return detectChangedFields(prev, compareColumn);
  }, [compareColumn, prevByName]);

  const hasUnsavedEdits = useMemo(() => {
    if (localColumns.length !== originalColumns.length) return true;
    for (let i = 0; i < localColumns.length; i++) {
      if (JSON.stringify(localColumns[i]) !== JSON.stringify(originalColumns[i])) return true;
    }
    return false;
  }, [localColumns, originalColumns]);

  /* ── event handlers ─────────────────────────────────────────────────── */

  const handleClose = () => {
    if (hasUnsavedEdits) {
      // Keep this lightweight — full confirm dialog would lock the close path
      // behind a click. window.confirm matches the existing app patterns for
      // benign discard prompts.
      const ok = window.confirm(
        "You have unsaved column edits. Close anyway and discard them?",
      );
      if (!ok) return;
    }
    setIsReviewDrawerOpen(false);
    setReviewingNotification(null);
  };

  const startEdit = (col: ColumnDefinition) => {
    setEditingId(col.id);
    setEditDraft({ ...col });
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
    setEditError(null);
  };

  const validateDraft = (draft: ColumnDefinition): string | null => {
    if (!draft.columnName.trim()) return "Column Name is required.";
    if (!draft.dataType.trim()) return "Data Type is required.";
    const dup = localColumns.find(
      (c) => c.id !== draft.id && c.columnName.trim().toLowerCase() === draft.columnName.trim().toLowerCase(),
    );
    if (dup) return `Column name "${draft.columnName}" duplicates another row.`;
    const defCheck = validateColumnDefault(draft.defaultValue, draft.dataType, `Column "${draft.columnName}"`);
    if (!defCheck.valid) return defCheck.error || "Default value is invalid.";
    return null;
  };

  const saveEditLocally = () => {
    if (!editDraft) return;
    const err = validateDraft(editDraft);
    if (err) {
      setEditError(err);
      return;
    }
    setLocalColumns((prev) =>
      prev.map((c) => {
        if (c.id !== editDraft.id) return c;
        const next = { ...editDraft };
        // Auto-promote No Change → Modify when the architect actually changes
        // a value — keeps DDL generation in sync with intent.
        if (
          c.action === "No Change" &&
          JSON.stringify({ ...c, action: "No Change" }) !== JSON.stringify({ ...next, action: "No Change" })
        ) {
          next.action = "Modify";
        }
        return next;
      }),
    );
    setEditingId(null);
    setEditDraft(null);
    setEditError(null);
  };

  const persistAllEdits = async () => {
    if (!tableDef?.id) {
      addToast("error", "Cannot persist edits: submission has no table id.");
      return false;
    }
    setSavingEdit(true);
    try {
      const tablePayload: Record<string, unknown> = {
        id: tableDef.id,
        // The save endpoint requires connection_id + database/schema/table. The
        // notification doesn't carry connection_id directly; the backend uses
        // the existing row's identity via `id`, so the strict zod schema accepts
        // these passthrough fields and overwrites only the mutable ones.
        connection_id: (tableDef as any).connectionId || (tableDef as any).connection_id,
        database_name: (tableDef as any).databaseName || (tableDef as any).database_name || "default_db",
        schema_name: tableDef.schemaName,
        table_name: tableDef.tableName,
        entity_logical_name: tableDef.entityLogicalName || null,
        distribution_style: tableDef.distributionStyle,
        vertical_name: tableDef.verticalName || null,
        business_area: tableDef.businessArea || null,
        definition: tableDef.definition || null,
        status: "submitted",
      };
      const dbColumns = localColumns.map((c, idx) => ({
        ...(c.id && !c.id.startsWith("new-col-") ? { id: c.id } : {}),
        ...columnToServer(c, idx),
      }));
      await api.post("/table-definitions", { table: tablePayload, columns: dbColumns });
      setOriginalColumns(localColumns.map((c) => ({ ...c })));
      addToast("success", "Column edits saved. Ready to approve or reject.");
      return true;
    } catch (err: any) {
      console.error(err);
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "Failed to save column edits.";
      addToast("error", msg);
      return false;
    } finally {
      setSavingEdit(false);
    }
  };

  const setRowDecision = (colId: string, decision: Decision | null) => {
    setDecisions((prev) => {
      const cur = prev[colId] || { decision: null, comment: "" };
      return { ...prev, [colId]: { ...cur, decision } };
    });
  };

  const setRowComment = (colId: string, comment: string) => {
    setDecisions((prev) => {
      const cur = prev[colId] || { decision: null, comment: "" };
      return { ...prev, [colId]: { ...cur, comment } };
    });
  };

  const toggleSelected = (colId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(colId)) next.delete(colId);
      else next.add(colId);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredColumns.map((c) => c.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const bulkSetDecision = (decision: Decision) => {
    if (selectedIds.size === 0) {
      addToast("info", "Select one or more rows first.");
      return;
    }
    setDecisions((prev) => {
      const next = { ...prev };
      selectedIds.forEach((id) => {
        const cur = next[id] || { decision: null, comment: "" };
        next[id] = { ...cur, decision };
      });
      return next;
    });
  };

  const handleApprove = async () => {
    if (hasUnsavedEdits) {
      const ok = await persistAllEdits();
      if (!ok) return;
    }
    approveSubmission(user?.name ?? "Architect");
  };

  const handleReject = async () => {
    if (hasUnsavedEdits) {
      const ok = await persistAllEdits();
      if (!ok) return;
    }
    rejectSubmission(user?.name ?? "Architect", rejectReason || undefined);
    setRejectReason("");
  };

  const copyDdl = async () => {
    try {
      await navigator.clipboard.writeText(ddlStatements.map((s) => s + ";").join("\n"));
      setDdlCopied(true);
      setTimeout(() => setDdlCopied(false), 1500);
    } catch {
      addToast("error", "Clipboard write failed.");
    }
  };

  const ddlMatchesColumn = (stmt: string, colName: string) => {
    if (!colName) return false;
    const re = new RegExp(`\\b${colName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return re.test(stmt);
  };

  /* ── render gates ───────────────────────────────────────────────────── */
  if (!isReviewDrawerOpen) return null;

  const status = (reviewingNotification?.tableDefinition as any)?.status || "submitted";
  const submittedAt = reviewingNotification?.timestamp
    ? new Date(reviewingNotification.timestamp).toLocaleString()
    : "—";

  /* ── render ─────────────────────────────────────────────────────────── */
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Review Submission"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
      >
        <div className="bg-slate-50 rounded-2xl shadow-2xl w-[95vw] h-[95vh] flex flex-col overflow-hidden pointer-events-auto">
          {/* ─── Sticky header ─────────────────────────────────────────── */}
          <header className="flex items-center justify-between gap-4 px-6 py-4 bg-white border-b border-slate-200 shadow-sm shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-slate-800 truncate">
                  Review Submission · {tableDef?.tableName || "Untitled"}
                </h2>
                <Badge variant={statusBadge[status] ?? "info"}>
                  {String(status).charAt(0).toUpperCase() + String(status).slice(1)}
                </Badge>
                {hasUnsavedEdits && (
                  <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded">
                    Unsaved edits
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Submitted by <span className="font-medium text-slate-700">{reviewingNotification?.submittedBy}</span>
                {" · "}
                {submittedAt}
                {tableDef?.schemaName && (
                  <>
                    {" · "}
                    Schema <span className="font-medium text-slate-700">{tableDef.schemaName}</span>
                  </>
                )}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100"
              aria-label="Close review"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </header>

          {/* ─── Content (scrollable) ──────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Table Properties — the submitted table-level metadata. Without
                this section, fields like Entity Logical Name / Vertical /
                Business Area / Distribution Style / Definition are silently
                dropped from the architect's view even though they're in the
                submission payload. */}
            <section
              className="bg-white border border-slate-200 rounded-xl"
              aria-label="Table properties"
            >
              <button
                type="button"
                onClick={() => setPropsExpanded(!propsExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 border-b border-slate-100"
                aria-expanded={propsExpanded}
              >
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-sm font-semibold text-slate-800">Table Properties</span>
                </div>
                <span className="text-xs text-slate-400">{propsExpanded ? "Hide" : "Show"}</span>
              </button>
              {propsExpanded && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 px-4 py-4">
                  {[
                    { label: "Table Name", value: tableDef?.tableName },
                    { label: "Entity Logical Name", value: tableDef?.entityLogicalName },
                    { label: "Schema Name", value: tableDef?.schemaName },
                    { label: "Distribution Style", value: tableDef?.distributionStyle },
                    { label: "Vertical Name", value: tableDef?.verticalName },
                    { label: "Business Area", value: tableDef?.businessArea },
                  ].map((p) => (
                    <div key={p.label} className="flex flex-col">
                      <span className="text-[11px] uppercase tracking-wide text-slate-400">
                        {p.label}
                      </span>
                      <span className="text-sm font-medium text-slate-800 mt-0.5 break-words">
                        {p.value && String(p.value).trim() ? (
                          String(p.value)
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </span>
                    </div>
                  ))}
                  {tableDef?.definition && (
                    <div className="sm:col-span-2 lg:col-span-3 pt-2 border-t border-slate-100">
                      <span className="text-[11px] uppercase tracking-wide text-slate-400">
                        Table Definition
                      </span>
                      <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap break-words">
                        {tableDef.definition}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Summary cards */}
            <section className="flex flex-wrap gap-3" aria-label="Change summary">
              <SummaryCard
                label="Added"
                count={counts.added}
                tone="emerald"
                active={actionFilter === "Add"}
                onClick={() => setActionFilter(actionFilter === "Add" ? "all" : "Add")}
              />
              <SummaryCard
                label="Modified"
                count={counts.modified}
                tone="blue"
                active={actionFilter === "Modify"}
                onClick={() => setActionFilter(actionFilter === "Modify" ? "all" : "Modify")}
              />
              <SummaryCard
                label="Deleted"
                count={counts.dropped}
                tone="red"
                active={actionFilter === "Drop"}
                onClick={() => setActionFilter(actionFilter === "Drop" ? "all" : "Drop")}
              />
              <SummaryCard
                label="Unchanged"
                count={counts.unchanged}
                tone="slate"
                active={actionFilter === "No Change"}
                onClick={() => setActionFilter(actionFilter === "No Change" ? "all" : "No Change")}
              />
            </section>

            {/* Tabs */}
            <div className="border-b border-slate-200 flex items-center gap-1">
              {(
                [
                  ["columns", `Columns (${filteredColumns.length}/${localColumns.length})`],
                  ["compare", "Side-by-Side Compare"],
                  ["ddl", `DDL Preview (${ddlStatements.length})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    activeTab === key
                      ? "border-indigo-500 text-indigo-700"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                  onClick={() => setActiveTab(key as any)}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ── Tab: Columns ──────────────────────────────────────────── */}
            {activeTab === "columns" && (
              <section className="space-y-3" aria-label="Columns">
                {/* Toolbar */}
                <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
                  <div className="relative flex-1 min-w-[240px]">
                    <svg
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search column, attribute, type, domain…"
                      className="w-full pl-10 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      aria-label="Search columns"
                    />
                  </div>

                  <label className="text-xs text-slate-500 flex items-center gap-2">
                    Sort
                    <select
                      value={sortKey}
                      onChange={(e) => setSortKey(e.target.value as SortKey)}
                      className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="columnName">Column Name</option>
                      <option value="action">Change Type</option>
                      <option value="dataType">Data Type</option>
                    </select>
                    <button
                      onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
                      className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                      aria-label="Toggle sort direction"
                      title={sortDir === "asc" ? "Ascending" : "Descending"}
                    >
                      {sortDir === "asc" ? "↑" : "↓"}
                    </button>
                  </label>

                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-slate-500">
                      {selectedIds.size} selected
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={selectAllFiltered}
                      disabled={filteredColumns.length === 0}
                    >
                      Select All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearSelection}
                      disabled={selectedIds.size === 0}
                    >
                      Clear
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => bulkSetDecision("approved")}
                      disabled={selectedIds.size === 0}
                    >
                      Bulk Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => bulkSetDecision("rejected")}
                      disabled={selectedIds.size === 0}
                    >
                      Bulk Reject
                    </Button>
                  </div>
                </div>

                {/* Table */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="max-h-[60vh] overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 sticky top-0 z-10">
                        <tr>
                          <th className="px-3 py-2 text-left w-8">
                            <input
                              type="checkbox"
                              checked={
                                filteredColumns.length > 0 &&
                                filteredColumns.every((c) => selectedIds.has(c.id))
                              }
                              onChange={(e) =>
                                e.target.checked ? selectAllFiltered() : clearSelection()
                              }
                              aria-label="Select all visible"
                            />
                          </th>
                          <th className="px-3 py-2 text-left w-8" aria-label="Expand" />
                          <th className="px-3 py-2 text-left">Column</th>
                          <th className="px-3 py-2 text-left">Attribute</th>
                          <th className="px-3 py-2 text-left">Data Type</th>
                          <th className="px-3 py-2 text-left">Nullable</th>
                          <th className="px-3 py-2 text-left">Default</th>
                          <th className="px-3 py-2 text-left">Domain</th>
                          <th className="px-3 py-2 text-left">Classification</th>
                          <th className="px-3 py-2 text-left">Change</th>
                          <th className="px-3 py-2 text-left">Decision</th>
                          <th className="px-3 py-2 text-right w-44">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredColumns.length === 0 && (
                          <tr>
                            <td colSpan={12} className="px-4 py-10 text-center text-sm text-slate-400">
                              No columns match the current search/filter.
                            </td>
                          </tr>
                        )}
                        {filteredColumns.map((col) => {
                          const isEditing = editingId === col.id;
                          const draft = isEditing ? editDraft! : col;
                          const dec = decisions[col.id]?.decision || null;
                          const cmt = decisions[col.id]?.comment || "";
                          const selected = selectedIds.has(col.id);
                          const focused = focusedColumnId === col.id;
                          return (
                            <React.Fragment key={col.id}>
                              <tr
                                className={`border-t border-slate-100 ${actionRowAccent[col.action]} ${
                                  selected ? "bg-indigo-50/40" : focused ? "bg-yellow-50/40" : ""
                                }`}
                              >
                                <td className="px-3 py-2 align-top">
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => toggleSelected(col.id)}
                                    aria-label={`Select ${col.columnName}`}
                                  />
                                </td>
                                <td className="px-2 py-2 align-top">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedRowId(expandedRowId === col.id ? null : col.id)
                                    }
                                    className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                                    aria-label={
                                      expandedRowId === col.id
                                        ? "Hide all attributes"
                                        : "Show all attributes"
                                    }
                                    aria-expanded={expandedRowId === col.id}
                                  >
                                    <svg
                                      className={`w-4 h-4 transition-transform ${
                                        expandedRowId === col.id ? "rotate-90" : ""
                                      }`}
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M9 5l7 7-7 7"
                                      />
                                    </svg>
                                  </button>
                                </td>
                                <td className="px-3 py-2 align-top">
                                  {isEditing ? (
                                    <input
                                      className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                      value={draft.columnName}
                                      onChange={(e) =>
                                        setEditDraft((d) => (d ? { ...d, columnName: e.target.value } : d))
                                      }
                                    />
                                  ) : (
                                    <button
                                      onClick={() => setFocusedColumnId(col.id)}
                                      className="font-mono text-sm text-slate-800 hover:text-indigo-700 hover:underline"
                                      title="Highlight related DDL"
                                    >
                                      {col.columnName || "—"}
                                    </button>
                                  )}
                                </td>
                                <td className="px-3 py-2 align-top">
                                  {isEditing ? (
                                    <input
                                      className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                      value={draft.attributeName ?? ""}
                                      onChange={(e) =>
                                        setEditDraft((d) =>
                                          d ? { ...d, attributeName: e.target.value } : d,
                                        )
                                      }
                                    />
                                  ) : (
                                    col.attributeName || <span className="text-slate-300">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 align-top">
                                  {isEditing ? (
                                    <select
                                      className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                      value={draft.dataType}
                                      onChange={(e) =>
                                        setEditDraft((d) => (d ? { ...d, dataType: e.target.value } : d))
                                      }
                                    >
                                      {DATA_TYPE_OPTIONS.map((dt) => (
                                        <option key={dt} value={dt}>
                                          {dt}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="font-mono text-xs">{col.dataType}</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 align-top">
                                  {isEditing ? (
                                    <input
                                      type="checkbox"
                                      checked={draft.isNullable}
                                      onChange={(e) =>
                                        setEditDraft((d) =>
                                          d ? { ...d, isNullable: e.target.checked } : d,
                                        )
                                      }
                                      aria-label="Nullable"
                                    />
                                  ) : col.isNullable ? (
                                    "YES"
                                  ) : (
                                    "NO"
                                  )}
                                </td>
                                <td className="px-3 py-2 align-top">
                                  {isEditing ? (
                                    <input
                                      className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                      value={draft.defaultValue}
                                      onChange={(e) =>
                                        setEditDraft((d) =>
                                          d ? { ...d, defaultValue: e.target.value } : d,
                                        )
                                      }
                                    />
                                  ) : (
                                    col.defaultValue || <span className="text-slate-300">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 align-top">
                                  {isEditing ? (
                                    <input
                                      className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                      value={draft.dataDomain}
                                      onChange={(e) =>
                                        setEditDraft((d) =>
                                          d ? { ...d, dataDomain: e.target.value } : d,
                                        )
                                      }
                                    />
                                  ) : (
                                    col.dataDomain || <span className="text-slate-300">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 align-top">
                                  {isEditing ? (
                                    <select
                                      className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                      value={draft.dataClassification}
                                      onChange={(e) =>
                                        setEditDraft((d) =>
                                          d ? { ...d, dataClassification: e.target.value as any } : d,
                                        )
                                      }
                                    >
                                      {CLASSIFICATION_OPTIONS.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    col.dataClassification || <span className="text-slate-300">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <Badge variant={actionBadgeVariant[col.action]}>{col.action}</Badge>
                                </td>
                                <td className="px-3 py-2 align-top">
                                  {dec ? (
                                    <span
                                      className={`inline-block text-xs font-medium px-2 py-0.5 rounded border ${decisionTone[dec]}`}
                                    >
                                      {dec === "approved" ? "Approved" : "Rejected"}
                                    </span>
                                  ) : (
                                    <span className="text-slate-300 text-xs">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 align-top text-right">
                                  {isEditing ? (
                                    <div className="flex items-center justify-end gap-1.5">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={cancelEdit}
                                      >
                                        Cancel
                                      </Button>
                                      <Button size="sm" variant="primary" onClick={saveEditLocally}>
                                        Save
                                      </Button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-end gap-1">
                                      <button
                                        onClick={() => {
                                          setActiveTab("compare");
                                          setCompareTargetId(col.id);
                                        }}
                                        className="text-xs px-2 py-1 rounded text-slate-600 hover:bg-slate-100"
                                        title="Compare with cluster value"
                                      >
                                        Compare
                                      </button>
                                      <button
                                        onClick={() => startEdit(col)}
                                        className="text-xs px-2 py-1 rounded text-slate-600 hover:bg-slate-100"
                                        title="Edit column"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        onClick={() =>
                                          setRowDecision(col.id, dec === "approved" ? null : "approved")
                                        }
                                        className={`text-xs px-2 py-1 rounded ${
                                          dec === "approved"
                                            ? "bg-emerald-100 text-emerald-700"
                                            : "text-emerald-700 hover:bg-emerald-50"
                                        }`}
                                        title="Mark column approved"
                                      >
                                        ✓
                                      </button>
                                      <button
                                        onClick={() =>
                                          setRowDecision(col.id, dec === "rejected" ? null : "rejected")
                                        }
                                        className={`text-xs px-2 py-1 rounded ${
                                          dec === "rejected"
                                            ? "bg-red-100 text-red-700"
                                            : "text-red-700 hover:bg-red-50"
                                        }`}
                                        title="Mark column rejected"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                              {isEditing && editError && (
                                <tr>
                                  <td colSpan={12} className="px-3 pb-3 pt-0">
                                    <p className="text-xs text-red-600">{editError}</p>
                                  </td>
                                </tr>
                              )}
                              {expandedRowId === col.id && !isEditing && (
                                <tr className="bg-slate-50/60">
                                  <td />
                                  <td colSpan={11} className="px-4 py-3">
                                    <FullAttributesPanel column={col} />
                                  </td>
                                </tr>
                              )}
                              {!isEditing && (cmt || dec) && (
                                <tr>
                                  <td />
                                  <td colSpan={11} className="px-3 pb-3 pt-0">
                                    <div className="flex items-start gap-2">
                                      <span className="text-[11px] text-slate-400 uppercase tracking-wide pt-1.5">
                                        Comment
                                      </span>
                                      <input
                                        value={cmt}
                                        onChange={(e) => setRowComment(col.id, e.target.value)}
                                        placeholder="Add a comment for this column…"
                                        className="flex-1 text-xs px-2 py-1 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                      />
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {/* ── Tab: Compare ──────────────────────────────────────────── */}
            {activeTab === "compare" && (
              <section className="space-y-3" aria-label="Side-by-side compare">
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <label className="text-xs font-medium text-slate-600 mr-2">Column</label>
                  <select
                    value={compareTargetId ?? ""}
                    onChange={(e) => setCompareTargetId(e.target.value || null)}
                    className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">— Choose a column —</option>
                    {localColumns
                      .filter((c) => c.action !== "No Change")
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.columnName} ({c.action})
                        </option>
                      ))}
                  </select>
                </div>

                {compareColumn ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-xs font-semibold uppercase tracking-wide text-red-700">
                        Before (cluster)
                      </div>
                      <CompareBefore
                        column={compareColumn}
                        prev={prevByName.get(compareColumn.columnName.toLowerCase())}
                        diffs={compareDiffs}
                      />
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="px-4 py-2 bg-emerald-50 border-b border-emerald-100 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                        After (this submission)
                      </div>
                      <CompareAfter column={compareColumn} diffs={compareDiffs} />
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-400">
                    Choose a column above (or click "Compare" on a row) to see the
                    side-by-side diff.
                  </div>
                )}
              </section>
            )}

            {/* ── Tab: DDL ─────────────────────────────────────────────── */}
            {activeTab === "ddl" && (
              <section className="space-y-3" aria-label="DDL preview">
                <DdlPanel
                  ddlStatements={ddlStatements}
                  dbType={dbType}
                  focusedColumnName={focusedColumn?.columnName ?? null}
                  expanded={ddlExpanded}
                  setExpanded={setDdlExpanded}
                  fullScreen={ddlFullScreen}
                  setFullScreen={setDdlFullScreen}
                  copied={ddlCopied}
                  onCopy={copyDdl}
                  matchesColumn={ddlMatchesColumn}
                />
                {focusedColumn && (
                  <div className="text-xs text-slate-500">
                    Highlighting DDL referencing{" "}
                    <span className="font-mono text-slate-700">{focusedColumn.columnName}</span>.{" "}
                    <button
                      onClick={() => setFocusedColumnId(null)}
                      className="text-indigo-600 hover:underline"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </section>
            )}
          </div>

          {/* ─── Sticky footer ─────────────────────────────────────────── */}
          <footer className="px-6 py-3 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] flex flex-wrap items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium">{localColumns.length}</span> columns
              <span className="text-slate-300">·</span>
              <span className="text-emerald-700">
                {Object.values(decisions).filter((d) => d.decision === "approved").length} approved
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-red-700">
                {Object.values(decisions).filter((d) => d.decision === "rejected").length} rejected
              </span>
            </div>

            <div className="flex-1" />

            <input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional)"
              className="w-72 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
            />

            <Button
              variant="secondary"
              onClick={() => setConfirmSave(true)}
              disabled={!hasUnsavedEdits || savingEdit}
            >
              {savingEdit ? "Saving…" : "Save Edits"}
            </Button>
            <Button variant="danger" onClick={() => setConfirmReject(true)} disabled={savingEdit}>
              Reject
            </Button>
            <Button variant="primary" onClick={() => setConfirmApprove(true)} disabled={savingEdit}>
              Approve &amp; Update Data Model
            </Button>
          </footer>
        </div>
      </div>

      {/* Confirmations */}
      <ConfirmDialog
        isOpen={confirmSave}
        onClose={() => setConfirmSave(false)}
        onConfirm={async () => {
          setConfirmSave(false);
          await persistAllEdits();
        }}
        title="Save column edits?"
        message="This will overwrite the submitted column metadata with your edits before the submission is approved."
        variant="warning"
        confirmLabel="Save edits"
      />
      <ConfirmDialog
        isOpen={confirmApprove}
        onClose={() => setConfirmApprove(false)}
        onConfirm={async () => {
          setConfirmApprove(false);
          await handleApprove();
        }}
        title="Approve submission?"
        message="Approval will persist any unsaved column edits and execute the DDL against the target cluster."
        variant="warning"
        confirmLabel="Approve & apply"
      />
      <ConfirmDialog
        isOpen={confirmReject}
        onClose={() => setConfirmReject(false)}
        onConfirm={async () => {
          setConfirmReject(false);
          await handleReject();
        }}
        title="Reject submission?"
        message="The developer will be notified with the rejection reason. They can revise and resubmit."
        variant="danger"
        confirmLabel="Reject submission"
      />
    </>
  );
};

/* ────────────────────────────────────────────────────────────────────────
   Sub-components
   ──────────────────────────────────────────────────────────────────────── */

const renderAttrValue = (v: unknown): React.ReactNode => {
  if (typeof v === "boolean") {
    return v ? (
      <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-emerald-100 text-emerald-700 text-[10px]">
        ✓
      </span>
    ) : (
      <span className="inline-flex items-center justify-center w-4 h-4 rounded border border-slate-300 text-slate-300 text-[10px]">
        ✕
      </span>
    );
  }
  if (typeof v === "number") return <span className="font-mono">{v}</span>;
  const s = String(v ?? "").trim();
  if (!s) return <span className="text-slate-300">—</span>;
  return s;
};

// Expanded per-row panel: surfaces every persisted column attribute so the
// architect can verify the submitted metadata without scrolling the main
// table sideways. Every field on ColumnDefinition is enumerated here — if a
// new field is added to the type, add it here too.
const FullAttributesPanel: React.FC<{ column: ColumnDefinition }> = ({ column }) => {
  const groups: Array<{ title: string; rows: Array<[string, unknown]> }> = [
    {
      title: "Identity",
      rows: [
        ["Column Name", column.columnName],
        ["Attribute Name", column.attributeName],
        ["Data Type", column.dataType],
        ["Data Domain", column.dataDomain],
        ["Data Classification", column.dataClassification],
        ["Attribute Definition", column.attributeDefinition],
      ],
    },
    {
      title: "Constraints & Storage",
      rows: [
        ["Nullable", column.isNullable],
        ["Primary Index", column.isPrimaryKey],
        ["Has Stats", column.hasStats],
        ["Sort Key", column.isSortKey],
        ["Dist Key", column.isDistKey],
        ["Default Value", column.defaultValue],
        ["Compress Value", column.compressValue],
        ["Column Format", column.columnFormat],
        ["Encoding", column.encoding],
        ["Tier Value", column.tierValue],
        ["Column Sequence", typeof column.sortOrder === "number" ? column.sortOrder + 1 : ""],
      ],
    },
    {
      title: "Lineage",
      rows: [
        ["Source Database Name", column.sourceDatabaseName],
        ["Source Table Name", column.sourceTableName],
        ["Source Column Name", column.sourceColumnName],
        ["Source System", column.sourceSystem],
        ["Transformation", column.transformation],
        ["Comments", column.comments],
      ],
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {groups.map((g) => (
        <div key={g.title} className="bg-white border border-slate-200 rounded-lg">
          <div className="px-3 py-1.5 border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {g.title}
          </div>
          <dl className="divide-y divide-slate-50">
            {g.rows.map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-3 px-3 py-2">
                <dt className="text-[11px] text-slate-500 flex-shrink-0">{label}</dt>
                <dd className="text-xs text-slate-800 text-right break-all max-w-[60%]">
                  {renderAttrValue(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
};

const CompareRow: React.FC<{ field: string; value: React.ReactNode; changed?: boolean }> = ({
  field,
  value,
  changed,
}) => (
  <div
    className={`flex items-start gap-3 px-4 py-2 border-b border-slate-50 ${
      changed ? "bg-yellow-50" : ""
    }`}
  >
    <span className="text-xs font-medium text-slate-500 min-w-[140px]">{field}</span>
    <span className="text-sm text-slate-800 font-mono break-all">{value || "—"}</span>
  </div>
);

const CompareBefore: React.FC<{
  column: ColumnDefinition;
  prev: PreviousColumnSnapshot | undefined;
  diffs: Array<{ field: string; before: string; after: string }>;
}> = ({ column, prev, diffs }) => {
  const changedFields = new Set(diffs.map((d) => d.field));
  if (!prev && column.action === "Add") {
    return (
      <div className="px-4 py-8 text-center text-sm text-slate-400 italic">
        Column does not exist on cluster yet — this is a new addition.
      </div>
    );
  }
  if (!prev) {
    return (
      <div className="px-4 py-8 text-center text-sm text-slate-400 italic">
        No prior cluster snapshot was captured.
      </div>
    );
  }
  return (
    <div>
      <CompareRow field="Column Name" value={prev.column_name} />
      <CompareRow field="Data Type" value={prev.data_type} changed={changedFields.has("Data Type")} />
      <CompareRow
        field="Nullable"
        value={toBoolNullable(prev.is_nullable) ? "YES" : "NO"}
        changed={changedFields.has("Nullable")}
      />
      <CompareRow
        field="Default"
        value={prev.column_default || "—"}
        changed={changedFields.has("Default")}
      />
    </div>
  );
};

const CompareAfter: React.FC<{
  column: ColumnDefinition;
  diffs: Array<{ field: string; before: string; after: string }>;
}> = ({ column, diffs }) => {
  const changedFields = new Set(diffs.map((d) => d.field));
  if (column.action === "Drop") {
    return (
      <div className="px-4 py-8 text-center text-sm text-red-500 italic">
        Column will be dropped on approval.
      </div>
    );
  }
  return (
    <div>
      <CompareRow field="Column Name" value={column.columnName} />
      <CompareRow field="Attribute Name" value={column.attributeName || "—"} />
      <CompareRow field="Data Type" value={column.dataType} changed={changedFields.has("Data Type")} />
      <CompareRow
        field="Nullable"
        value={column.isNullable ? "YES" : "NO"}
        changed={changedFields.has("Nullable")}
      />
      <CompareRow
        field="Default"
        value={column.defaultValue || "—"}
        changed={changedFields.has("Default")}
      />
      <CompareRow field="Data Domain" value={column.dataDomain || "—"} />
      <CompareRow field="Classification" value={column.dataClassification || "—"} />
      <CompareRow field="Definition" value={column.attributeDefinition || "—"} />
    </div>
  );
};

interface DdlPanelProps {
  ddlStatements: string[];
  dbType?: string;
  focusedColumnName: string | null;
  expanded: boolean;
  setExpanded: (b: boolean) => void;
  fullScreen: boolean;
  setFullScreen: (b: boolean) => void;
  copied: boolean;
  onCopy: () => void;
  matchesColumn: (stmt: string, col: string) => boolean;
}

const DdlPanel: React.FC<DdlPanelProps> = ({
  ddlStatements,
  dbType,
  focusedColumnName,
  expanded,
  setExpanded,
  fullScreen,
  setFullScreen,
  copied,
  onCopy,
  matchesColumn,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const ddlKind: "create" | "alter" | "none" =
    ddlStatements.length === 0
      ? "none"
      : ddlStatements.some((s) => /^\s*CREATE\s+TABLE\b/i.test(s))
      ? "create"
      : "alter";

  const body = (
    <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">
            DDL
          </span>
          {ddlKind !== "none" && (
            <Badge variant={ddlKind === "create" ? "success" : "info"}>
              {ddlKind === "create" ? "CREATE TABLE" : "ALTER TABLE"}
            </Badge>
          )}
          {dbType && (
            <span className="text-[11px] text-slate-400 uppercase tracking-wide">{dbType}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onCopy}
            className="text-xs px-2 py-1 rounded text-slate-300 hover:bg-slate-700"
            title="Copy DDL"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs px-2 py-1 rounded text-slate-300 hover:bg-slate-700"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
          <button
            onClick={() => setFullScreen(!fullScreen)}
            className="text-xs px-2 py-1 rounded text-slate-300 hover:bg-slate-700"
          >
            {fullScreen ? "Exit Full Screen" : "Full Screen"}
          </button>
        </div>
      </div>
      {expanded && (
        <div
          ref={containerRef}
          className={`font-mono text-xs leading-relaxed overflow-auto ${
            fullScreen ? "max-h-[80vh]" : "max-h-[40vh]"
          }`}
        >
          {ddlStatements.length === 0 ? (
            <div className="px-4 py-6 text-slate-400 italic">
              No DDL to run on approval — submission has no column changes.
            </div>
          ) : (
            <div className="px-3 py-2">
              {ddlStatements.map((stmt, i) => {
                const highlighted = !!focusedColumnName && matchesColumn(stmt, focusedColumnName);
                return (
                  <div key={i} className="flex">
                    <span className="select-none text-slate-600 pr-3 text-right" style={{ minWidth: 32 }}>
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <SqlLine text={stmt + ";"} highlighted={highlighted} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (!fullScreen) return body;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
        onClick={() => setFullScreen(false)}
      />
      <div className="fixed inset-4 z-[70] flex flex-col">{body}</div>
    </>
  );
};
