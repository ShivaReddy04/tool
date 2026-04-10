import React from "react";

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const TextInput: React.FC<TextInputProps> = ({
  label,
  error,
  required,
  className = "",
  id,
  ...props
}) => {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-medium text-slate-600 uppercase tracking-wide"
        >
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <input
        id={inputId}
        className={`
          w-full px-3 py-2 text-sm rounded-xl border bg-white
          transition-colors duration-150
          focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
          disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed
          ${error ? "border-red-300 focus:ring-red-500" : "border-slate-300"}
        `}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};
