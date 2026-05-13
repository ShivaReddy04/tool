import React from "react";
import { TopBar } from "./TopBar";
import { FooterStatusBar } from "./FooterStatusBar";
import { StepIndicator } from "../common";
import { useDashboard } from "../../context/DashboardContext";

interface DashboardLayoutProps {
  leftPanel: React.ReactNode;
  centerPanel: React.ReactNode;
  rightPanel?: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  leftPanel,
  centerPanel,
  rightPanel,
}) => {
  const { steps, setCurrentStep } = useDashboard();
  // When there's no right panel the center expands to fill the remaining
  // 9 columns — needed for wide views like the 24-attribute column grid.
  const hasRight = rightPanel != null && rightPanel !== false;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <TopBar />

      <div className="py-4 bg-white border-b border-slate-200">
        <StepIndicator steps={steps} onStepClick={setCurrentStep} />
      </div>

      <main className="flex-1 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1600px] mx-auto">
          <div className="lg:col-span-3">{leftPanel}</div>
          <div className={hasRight ? "lg:col-span-5" : "lg:col-span-9"}>
            {centerPanel}
          </div>
          {hasRight && <div className="lg:col-span-4">{rightPanel}</div>}
        </div>
      </main>

      <FooterStatusBar />
    </div>
  );
};
