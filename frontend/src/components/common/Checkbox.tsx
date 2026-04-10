import React from "react";

interface CheckboxProps {
  label?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  label,
  checked,
  onChange,
  disabled = false,
  id,
}) => {
  const checkboxId = id || label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <label
      htmlFor={checkboxId}
      className={`inline-flex items-center gap-2 cursor-pointer ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      }`}
    >
      <input
        id={checkboxId}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
      />
      {label && <span className="text-sm text-slate-700">{label}</span>}
    </label>
  );
};
