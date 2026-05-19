import React, { useEffect, useRef, useState, useMemo } from "react";
import { Badge } from "../common";
import type { TableSummary } from "../../types";

// Workflow status → badge styling. Terminal-success states (approved /
// applied / processed) intentionally render no badge so the eye is drawn to
// rows that still need attention.
type BadgeVariant = "info" | "success" | "warning" | "danger" | "neutral";
const STATUS_META: Record<
  NonNullable<TableSummary["status"]>,
  { label: string; variant: BadgeVariant } | null
> = {
  draft: { label: "Draft", variant: "neutral" },
  submitted: { label: "Pending review", variant: "info" },
  rejected: { label: "Rejected", variant: "danger" },
  approved: null,
  applied: null,
  processed: null,
};

interface TablePickerDropdownProps {
  label?: string;
  tables: TableSummary[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const TablePickerDropdown: React.FC<TablePickerDropdownProps> = ({
  label,
  tables,
  value,
  onChange,
  placeholder = "Choose a table",
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  const selected = useMemo(
    () => tables.find((t) => t.id === value) || null,
    [tables, value],
  );

  // Close on outside click. mousedown (not click) so a click inside the
  // dropdown doesn't first close it then re-open it via the trigger.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Reset/seed the keyboard cursor each time the menu opens.
  useEffect(() => {
    if (open) {
      const idx = tables.findIndex((t) => t.id === value);
      setActiveIndex(idx >= 0 ? idx : 0);
    }
  }, [open, tables, value]);

  // Keep the active option scrolled into view while arrow-keying through a
  // long list — without this, the highlight slides off the bottom edge.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    const el = listRef.current?.querySelector<HTMLLIElement>(
      `[data-option-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1 >= tables.length ? 0 : i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 < 0 ? tables.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < tables.length) {
        onChange(tables[activeIndex].id);
        setOpen(false);
      }
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(tables.length - 1);
    }
  };

  const selectedBadge = selected ? STATUS_META[selected.status ?? "approved"] : null;

  return (
    <div className="flex flex-col gap-1.5" ref={containerRef}>
      {label && (
        <span className="text-xs font-medium text-slate-600 uppercase tracking-wide">
          {label}
        </span>
      )}
      <div
        className="relative"
        onKeyDown={handleKeyDown}
      >
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls="table-picker-listbox"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          className={`
            w-full flex items-center justify-between gap-2 px-3 py-2 text-sm
            rounded-xl border bg-white text-left
            transition-colors duration-150
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
            disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed
            border-slate-300
          `}
        >
          <span className="flex items-center gap-2 min-w-0 flex-1">
            {selected ? (
              <>
                <span className="truncate text-slate-800">{selected.name}</span>
                {selectedBadge && (
                  <Badge variant={selectedBadge.variant} dot>
                    {selectedBadge.label}
                  </Badge>
                )}
              </>
            ) : (
              <span className="text-slate-400">{placeholder}</span>
            )}
          </span>
          <svg
            className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${
              open ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <ul
            ref={listRef}
            id="table-picker-listbox"
            role="listbox"
            className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg py-1"
          >
            {tables.length === 0 && (
              <li className="px-3 py-2 text-xs text-slate-400">No tables.</li>
            )}
            {tables.map((t, idx) => {
              const meta = STATUS_META[t.status ?? "approved"];
              const isSelected = t.id === value;
              const isActive = idx === activeIndex;
              return (
                <li
                  key={t.id}
                  data-option-index={idx}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    onChange(t.id);
                    setOpen(false);
                  }}
                  className={`
                    px-3 py-2 text-sm cursor-pointer flex items-center justify-between gap-2
                    ${isActive ? "bg-indigo-50" : ""}
                    ${isSelected ? "font-semibold text-indigo-700" : "text-slate-800"}
                  `}
                >
                  <span className="truncate">{t.name}</span>
                  {meta && (
                    <Badge variant={meta.variant} dot>
                      {meta.label}
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
