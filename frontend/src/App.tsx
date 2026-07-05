import { Navigate, Route, Routes } from "react-router-dom";
import { Spin } from "antd";
import { useAuth } from "./auth/AuthContext";
import AppLayout from "./components/AppLayout";
import BranchesPage from "./pages/BranchesPage";
import CompaniesPage from "./pages/CompaniesPage";
import CustomersPage from "./pages/CustomersPage";
import DashboardPage from "./pages/DashboardPage";
import DispositionsPage from "./pages/DispositionsPage";
import EmployeesPage from "./pages/EmployeesPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ImportPage from "./pages/ImportPage";
import LoginPage from "./pages/LoginPage";
import TeamsPage from "./pages/TeamsPage";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
        <Spin size="large" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="branches" element={<BranchesPage />} />
        <Route path="teams" element={<TeamsPage />} />
        <Route path="companies" element={<CompaniesPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="dispositions" element={<DispositionsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
