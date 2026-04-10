import React from "react";
import { TopBar } from "./TopBar";
import { FooterStatusBar } from "./FooterStatusBar";
import { StepIndicator } from "../common";
import { useDashboard } from "../../context/DashboardContext";

interface DashboardLayoutProps {
  leftPanel: React.ReactNode;
  centerPanel: React.ReactNode;
  rightPanel: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  leftPanel,
  centerPanel,
  rightPanel,
}) => {
  const { steps, setCurrentStep } = useDashboard();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <TopBar />

      <div className="py-4 bg-white border-b border-slate-200">
        <StepIndicator steps={steps} onStepClick={setCurrentStep} />
      </div>

      <main className="flex-1 p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1600px] mx-auto">
          <div className="lg:col-span-3">{leftPanel}</div>
          <div className="lg:col-span-5">{centerPanel}</div>
          <div className="lg:col-span-4">{rightPanel}</div>
        </div>
      </main>

      <FooterStatusBar />
    </div>
  );
};
