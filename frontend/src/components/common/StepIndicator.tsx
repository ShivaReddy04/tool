import React from "react";
import type { Step } from "../../types";

interface StepIndicatorProps {
  steps: Step[];
  onStepClick?: (stepNumber: number) => void;
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({
  steps,
  onStepClick,
}) => {
  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((step, index) => (
        <React.Fragment key={step.number}>
          <button
            onClick={() =>
              step.status === "completed" && onStepClick?.(step.number)
            }
            disabled={step.status === "pending"}
            className={`
              flex items-center gap-2.5 px-4 py-2 rounded-xl transition-all duration-200
              ${step.status === "completed" ? "cursor-pointer hover:bg-emerald-50" : ""}
              ${step.status === "pending" ? "cursor-not-allowed opacity-50" : ""}
              ${step.status === "active" ? "bg-indigo-50" : ""}
            `}
          >
            <div
              className={`
                flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold
                transition-all duration-200
                ${step.status === "completed" ? "bg-emerald-500 text-white" : ""}
                ${step.status === "active" ? "bg-indigo-600 text-white ring-4 ring-indigo-100" : ""}
                ${step.status === "pending" ? "bg-slate-200 text-slate-500" : ""}
              `}
            >
              {step.status === "completed" ? (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                step.number
              )}
            </div>
            <span
              className={`text-sm font-medium ${
                step.status === "active"
                  ? "text-indigo-700"
                  : step.status === "completed"
                  ? "text-emerald-700"
                  : "text-slate-400"
              }`}
            >
              {step.label}
            </span>
          </button>

          {index < steps.length - 1 && (
            <div
              className={`w-12 h-0.5 mx-1 rounded-full transition-colors duration-200 ${
                steps[index + 1].status !== "pending"
                  ? "bg-emerald-400"
                  : "bg-slate-200"
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
