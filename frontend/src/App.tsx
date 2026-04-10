import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { DashboardProvider } from "./context/DashboardContext";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { DeveloperDashboard } from "./pages/DeveloperDashboard";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { UnauthorizedPage } from "./pages/UnauthorizedPage";

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
                  <DeveloperDashboard />
                </DashboardProvider>
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
