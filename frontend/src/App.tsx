import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate, useParams } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { DashboardProvider, useDashboard } from "./context/DashboardContext";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { DeveloperDashboard } from "./pages/DeveloperDashboard";
import { CreateTablePage } from "./pages/CreateTablePage";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { UnauthorizedPage } from "./pages/UnauthorizedPage";
import { ArchitectDashboard } from "./pages/ArchitectDashboard";
import { TemplateReview } from "./pages/TemplateReview";

// Bookmarks pointing at the legacy /dashboard/tables/:tableId route still
// work — we adopt the id into the dashboard's selection and redirect home.
// All editing happens inline on /dashboard now.
const LegacyTableRedirect: React.FC = () => {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const { setSelectedTableId } = useDashboard();
  useEffect(() => {
    if (tableId) setSelectedTableId(decodeURIComponent(tableId));
    navigate("/dashboard", { replace: true });
  }, [tableId, navigate, setSelectedTableId]);
  return null;
};

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
            <Route path="new-table" element={<CreateTablePage />} />
            <Route path="tables/:tableId" element={<LegacyTableRedirect />} />
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
