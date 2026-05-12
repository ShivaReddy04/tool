import React, { useEffect, useMemo, useRef, useState } from "react";
import type { BusinessArea, BusinessAreaLevel } from "../../types";
import { listBusinessAreas } from "../../api/businessAreas";

/**
 * Layered business-area picker:
 *   Layer 1 → Domain
 *   Layer 2 → Business Area
 *   Layer 3 → Sub Area
 *
 * Each layer is rendered as a searchable combobox. Selecting a value at one
 * level loads its children for the next level; clearing it cascades the
 * downstream layers back to empty. The component reports the deepest
 * currently-selected node back via `onChange` so consumers store a single
 * `business_area_id` that tracks the most specific tag the user picked.
 *
 * Backward compatibility: legacy flat business areas are stored as
 * `level='business_area'` with `parent_id=NULL`, so they still surface in
 * Layer 2 once a domain isn't selected — and they continue to round-trip
 * through `onChange` unchanged.
 */

interface BusinessAreaSelectorProps {
  value: string;
  onChange: (id: string, area: BusinessArea | null) => void;
  /** Pre-fetched node corresponding to `value`. Used to hydrate the layers
   * when this component mounts on an existing record. */
  initialResolved?: BusinessArea | null;
  disabled?: boolean;
  className?: string;
}

interface LayerState {
  options: BusinessArea[];
  loading: boolean;
}

const emptyLayer: LayerState = { options: [], loading: false };

const LEVEL_LABELS: Record<BusinessAreaLevel, string> = {
  domain: "Domain",
  business_area: "Business Area",
  sub_area: "Sub Area",
};

interface SearchableComboProps {
  label: string;
  options: BusinessArea[];
  value: string;
  onSelect: (area: BusinessArea | null) => void;
  placeholder: string;
  disabled?: boolean;
  loading?: boolean;
}

const SearchableCombo: React.FC<SearchableComboProps> = ({
  label,
  options,
  value,
  onSelect,
  placeholder,
  disabled,
  loading,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click — we use a single document listener and bail
  // immediately when the dropdown is closed to avoid unnecessary re-renders.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = options.find((o) => o.id === value) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div className="flex flex-col gap-1.5" ref={wrapRef}>
      <label className="text-xs font-medium text-slate-600 uppercase tracking-wide">
        {label}
      </label>
      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className={`w-full px-3 py-2 text-sm rounded-xl border bg-white text-left flex items-center justify-between transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
            disabled ? "bg-slate-50 text-slate-400 cursor-not-allowed border-slate-200" : "border-slate-300"
          }`}
        >
          <span className={selected ? "text-slate-800" : "text-slate-400"}>
            {selected ? selected.name : placeholder}
          </span>
          <svg
            className={`w-4 h-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && !disabled && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            <div className="p-2 border-b border-slate-100">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
                className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            <ul className="max-h-56 overflow-y-auto py-1">
              {selected && (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(null);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
                  >
                    Clear selection
                  </button>
                </li>
              )}

              {loading && (
                <li className="px-3 py-2 text-xs text-slate-400">Loading...</li>
              )}

              {!loading && filtered.length === 0 && (
                <li className="px-3 py-2 text-xs text-slate-400">
                  {options.length === 0 ? "No options available" : "No matches"}
                </li>
              )}

              {!loading &&
                filtered.map((opt) => (
                  <li key={opt.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(opt);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-indigo-50 ${
                        opt.id === value ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-700"
                      }`}
                    >
                      {opt.name}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export const BusinessAreaSelector: React.FC<BusinessAreaSelectorProps> = ({
  value,
  onChange,
  initialResolved,
  disabled,
  className = "",
}) => {
  const [domain, setDomain] = useState<BusinessArea | null>(null);
  const [businessArea, setBusinessArea] = useState<BusinessArea | null>(null);
  const [subArea, setSubArea] = useState<BusinessArea | null>(null);

  const [domainsLayer, setDomainsLayer] = useState<LayerState>(emptyLayer);
  const [areasLayer, setAreasLayer] = useState<LayerState>(emptyLayer);
  const [subsLayer, setSubsLayer] = useState<LayerState>(emptyLayer);

  // Hydrate top-level domains once on mount.
  useEffect(() => {
    let cancelled = false;
    setDomainsLayer({ options: [], loading: true });
    Promise.all([
      listBusinessAreas({ level: "domain" }),
      // legacy flat rows that were saved before the hierarchy migration —
      // surface them at Layer 2 with no parent so existing records still work.
      listBusinessAreas({ level: "business_area", parentId: null }),
    ])
      .then(([domains, legacy]) => {
        if (cancelled) return;
        setDomainsLayer({ options: domains, loading: false });
        // Pre-populate the legacy bucket so users can pick a flat business
        // area without first having to choose a domain.
        setAreasLayer((prev) => ({
          options: prev.options.length ? prev.options : legacy,
          loading: false,
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setDomainsLayer({ options: [], loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Hydrate from `initialResolved` when the parent already knows which
  // record `value` refers to (e.g. coming back from a saved table).
  useEffect(() => {
    if (!initialResolved || !value) return;
    if (initialResolved.id !== value) return;

    if (initialResolved.level === "domain") {
      setDomain(initialResolved);
    } else if (initialResolved.level === "sub_area" && initialResolved.parentId) {
      setSubArea(initialResolved);
    } else {
      setBusinessArea(initialResolved);
    }
  }, [initialResolved, value]);

  // Load business areas under the selected domain.
  useEffect(() => {
    if (!domain) return;
    let cancelled = false;
    setAreasLayer({ options: [], loading: true });
    listBusinessAreas({ level: "business_area", parentId: domain.id })
      .then((opts) => {
        if (!cancelled) setAreasLayer({ options: opts, loading: false });
      })
      .catch(() => {
        if (!cancelled) setAreasLayer({ options: [], loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [domain]);

  // Load sub-areas under the selected business area.
  useEffect(() => {
    if (!businessArea) {
      setSubsLayer(emptyLayer);
      return;
    }
    let cancelled = false;
    setSubsLayer({ options: [], loading: true });
    listBusinessAreas({ level: "sub_area", parentId: businessArea.id })
      .then((opts) => {
        if (!cancelled) setSubsLayer({ options: opts, loading: false });
      })
      .catch(() => {
        if (!cancelled) setSubsLayer({ options: [], loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [businessArea]);

  // Whenever any layer changes, propagate the deepest selected node upward.
  useEffect(() => {
    const deepest = subArea || businessArea || domain || null;
    onChange(deepest?.id || "", deepest);
    // We intentionally exclude `onChange` from deps — consumer is expected
    // to keep it stable; including it would re-fire the effect on every
    // parent re-render and overwrite intermediate state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, businessArea, subArea]);

  return (
    <div className={`grid grid-cols-1 gap-3 ${className}`}>
      <SearchableCombo
        label={LEVEL_LABELS.domain}
        options={domainsLayer.options}
        loading={domainsLayer.loading}
        value={domain?.id || ""}
        placeholder="Select domain"
        disabled={disabled}
        onSelect={(d) => {
          setDomain(d);
          // Cascade-clear downstream layers when the parent changes.
          setBusinessArea(null);
          setSubArea(null);
          if (!d) setAreasLayer(emptyLayer);
        }}
      />

      <SearchableCombo
        label={LEVEL_LABELS.business_area}
        options={areasLayer.options}
        loading={areasLayer.loading}
        value={businessArea?.id || ""}
        placeholder={domain ? "Select business area" : "Select domain or pick legacy area"}
        disabled={disabled || (!domain && areasLayer.options.length === 0)}
        onSelect={(b) => {
          setBusinessArea(b);
          setSubArea(null);
        }}
      />

      <SearchableCombo
        label={LEVEL_LABELS.sub_area}
        options={subsLayer.options}
        loading={subsLayer.loading}
        value={subArea?.id || ""}
        placeholder={businessArea ? "Select sub area" : "Select business area first"}
        disabled={disabled || !businessArea}
        onSelect={(s) => setSubArea(s)}
      />
    </div>
  );
};
