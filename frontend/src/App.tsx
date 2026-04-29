import React from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { DashboardProvider } from "./context/DashboardContext";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { DeveloperDashboard } from "./pages/DeveloperDashboard";
import { TableDetailsPage } from "./pages/TableDetailsPage";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { UnauthorizedPage } from "./pages/UnauthorizedPage";
import { ArchitectDashboard } from "./pages/ArchitectDashboard";
import { TemplateReview } from "./pages/TemplateReview";

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={["developer", "architect"]}>
                <DashboardProvider>
                  <Outlet />
                </DashboardProvider>
              </ProtectedRoute>
            }
          >
            <Route index element={<DeveloperDashboard />} />
            <Route path="tables/:tableId" element={<TableDetailsPage />} />
          </Route>

          <Route
            path="/architect"
            element={
              <ProtectedRoute allowedRoles={["architect"]}>
                <ArchitectDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/architect/templates/:id"
            element={
              <ProtectedRoute allowedRoles={["architect"]}>
                <TemplateReview />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
