import React, { useCallback, useEffect, useRef, useState } from "react";
import { fetchArchitects, formatArchitectName, Architect } from "../../api/architects";

interface ArchitectSelectorProps {
  value: Architect | null;
  onChange: (architect: Architect | null) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
  autoFocus?: boolean;
}

const SEARCH_DEBOUNCE_MS = 200;

export const ArchitectSelector: React.FC<ArchitectSelectorProps> = ({
  value,
  onChange,
  label,
  placeholder = "Search architects by name or email…",
  required,
  error,
  autoFocus,
}) => {
  // `query` is what's in the input box. When an architect is selected, we
  // mirror their formatted name into the input so the field reads naturally;
  // typing again clears the selection and resumes searching.
  const [query, setQuery] = useState(value ? formatArchitectName(value) : "");
  const [results, setResults] = useState<Architect[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Keep input text in sync if the parent swaps the selected architect out
  // from under us (e.g., reset on close).
  useEffect(() => {
    setQuery(value ? formatArchitectName(value) : "");
  }, [value]);

  // Debounced search. We always issue at least one request (empty term →
  // first page of architects) so the dropdown shows something useful the
  // moment the user focuses the field.
  useEffect(() => {
    if (!isOpen) return;

    // If the input still matches the selected architect's display name,
    // the user hasn't started a new search — don't refetch on every render.
    if (value && query === formatArchitectName(value)) return;

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const handle = setTimeout(async () => {
      setIsLoading(true);
      setFetchError(null);
      try {
        const list = await fetchArchitects(query.trim(), controller.signal);
        if (!controller.signal.aborted) {
          setResults(list);
          setActiveIndex(list.length > 0 ? 0 : -1);
        }
      } catch (err: any) {
        if (controller.signal.aborted || err?.name === "CanceledError" || err?.code === "ERR_CANCELED") return;
        console.error("ArchitectSelector fetch failed:", err);
        setFetchError("Couldn't load architects. Try again.");
        setResults([]);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [query, isOpen, value]);

  // Close on outside click.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const selectArchitect = useCallback(
    (architect: Architect) => {
      onChange(architect);
      setQuery(formatArchitectName(architect));
      setIsOpen(false);
      setActiveIndex(-1);
    },
    [onChange]
  );

  const clearSelection = useCallback(() => {
    onChange(null);
    setQuery("");
    setResults([]);
    setActiveIndex(-1);
    inputRef.current?.focus();
    setIsOpen(true);
  }, [onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) setIsOpen(true);
      setActiveIndex((idx) => (results.length === 0 ? -1 : (idx + 1) % results.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((idx) =>
        results.length === 0 ? -1 : (idx - 1 + results.length) % results.length
      );
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && activeIndex < results.length) {
        e.preventDefault();
        selectArchitect(results[activeIndex]);
      }
    } else if (e.key === "Escape") {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    }
  };

  const inputId = label ? label.toLowerCase().replace(/\s+/g, "-") : undefined;
  const showDropdown = isOpen && (isLoading || fetchError !== null || results.length > 0 || query.trim().length > 0);

  return (
    <div className="flex flex-col gap-1.5" ref={containerRef}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium text-slate-600 uppercase tracking-wide"
        >
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      <div className="relative">
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            // Typing invalidates any prior selection so the parent doesn't
            // hold a stale architect when the input no longer matches them.
            if (value && next !== formatArchitectName(value)) {
              onChange(null);
            }
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls="architect-selector-listbox"
          aria-activedescendant={
            activeIndex >= 0 ? `architect-option-${activeIndex}` : undefined
          }
          role="combobox"
          className={`
            w-full px-3 py-2 pr-9 text-sm rounded-xl border bg-white
            transition-colors duration-150
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
            ${error ? "border-red-300 focus:ring-red-500" : "border-slate-300"}
          `}
        />

        {value && (
          <button
            type="button"
            onClick={clearSelection}
            aria-label="Clear selected architect"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {showDropdown && (
          <ul
            id="architect-selector-listbox"
            role="listbox"
            className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg"
          >
            {isLoading && (
              <li className="px-3 py-2 text-xs text-slate-400">Searching…</li>
            )}

            {!isLoading && fetchError && (
              <li className="px-3 py-2 text-xs text-red-500">{fetchError}</li>
            )}

            {!isLoading && !fetchError && results.length === 0 && (
              <li className="px-3 py-2 text-xs text-slate-400">
                No architects match “{query.trim()}”.
              </li>
            )}

            {!isLoading &&
              !fetchError &&
              results.map((arch, idx) => {
                const isActive = idx === activeIndex;
                const isSelected = value?.id === arch.id;
                return (
                  <li
                    id={`architect-option-${idx}`}
                    key={arch.id}
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(e) => {
                      // Use mouseDown so the click registers before the
                      // input's blur tears down the dropdown.
                      e.preventDefault();
                      selectArchitect(arch);
                    }}
                    onMouseEnter={() => setActiveIndex(idx)}
                    className={`
                      px-3 py-2 cursor-pointer flex flex-col gap-0.5
                      ${isActive ? "bg-indigo-50" : "hover:bg-slate-50"}
                      ${isSelected ? "ring-1 ring-inset ring-indigo-200" : ""}
                    `}
                  >
                    <span className="text-sm font-medium text-slate-800">
                      {formatArchitectName(arch)}
                    </span>
                    <span className="text-xs text-slate-500">{arch.email}</span>
                  </li>
                );
              })}
          </ul>
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};
