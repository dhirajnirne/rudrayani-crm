import { Navigate, Route, Routes } from "react-router-dom";
import { Spin } from "antd";
import { lazy } from "react";
import { useAuth } from "./auth/AuthContext";
import AppLayout from "./components/AppLayout";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import LoginPage from "./pages/LoginPage";

// Lazy: none of these are needed until after login, and most users only ever
// touch a handful of them (role-gated in AppLayout's nav) -- bundling all 15+
// admin pages into the initial load would bloat the login screen for no reason.
const AllocationPage = lazy(() => import("./pages/AllocationPage"));
const AttendancePage = lazy(() => import("./pages/AttendancePage"));
const BranchesPage = lazy(() => import("./pages/BranchesPage"));
const BucketsPage = lazy(() => import("./pages/BucketsPage"));
const CompaniesPage = lazy(() => import("./pages/CompaniesPage"));
const CustomersPage = lazy(() => import("./pages/CustomersPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const DayPlanPage = lazy(() => import("./pages/DayPlanPage"));
const DepositsPage = lazy(() => import("./pages/DepositsPage"));
const DispositionsPage = lazy(() => import("./pages/DispositionsPage"));
const EmployeesPage = lazy(() => import("./pages/EmployeesPage"));
const ImportPage = lazy(() => import("./pages/ImportPage"));
const ImportReviewPage = lazy(() => import("./pages/ImportReviewPage"));
const ReallocationRequestsPage = lazy(() => import("./pages/ReallocationRequestsPage"));
const TargetsPage = lazy(() => import("./pages/TargetsPage"));
const TeamsPage = lazy(() => import("./pages/TeamsPage"));
const TrackingPage = lazy(() => import("./pages/TrackingPage"));

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
        <Route path="buckets" element={<BucketsPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="import-reviews" element={<ImportReviewPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="allocation" element={<AllocationPage />} />
        <Route path="reallocation-requests" element={<ReallocationRequestsPage />} />
        <Route path="dispositions" element={<DispositionsPage />} />
        <Route path="tracking" element={<TrackingPage />} />
        <Route path="day-plan" element={<DayPlanPage />} />
        <Route path="targets" element={<TargetsPage />} />
        <Route path="deposits" element={<DepositsPage />} />
        <Route path="attendance" element={<AttendancePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
