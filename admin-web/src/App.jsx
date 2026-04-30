import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import AdminHomePage from './pages/AdminHomePage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import AuditsPage from './pages/AuditsPage.jsx';
import MasterPoisPage from './pages/MasterPoisPage.jsx';
import UserManagementPage from './pages/UserManagementPage.jsx';
import DeviceManagementPage from './pages/DeviceManagementPage.jsx';
import OwnerSubmissionsPage from './pages/OwnerSubmissionsPage.jsx';
import SubmitPoiPage from './pages/SubmitPoiPage.jsx';
import IntelligenceDashboard from './pages/intelligence/Dashboard.jsx';
import DashboardLayout from './components/DashboardLayout.jsx';
import AdminChangeRequestsPage from './pages/AdminChangeRequestsPage.jsx';
import ZonesManagementPage from './pages/ZonesManagementPage.jsx';
import AudioAnalyticsPage from './pages/AudioAnalyticsPage.jsx';
import ZonesManagementPage from './pages/ZonesManagementPage.jsx';

function Protected({ children }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function RequireRole({ allowedRoles, children }) {
  const { user } = useAuth();
  if (!allowedRoles.includes(user?.role)) {
    return <Navigate to="/forbidden" replace />;
  }
  return children;
}

function RoleHomeRedirect() {
  const { user } = useAuth();
  if (user?.role === 'ADMIN') return <Navigate to="/dashboard" replace />;
  if (user?.role === 'OWNER') return <Navigate to="/my-pois" replace />;
  return <Navigate to="/forbidden" replace />;
}

function ForbiddenPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Không có quyền truy cập</h1>
        <p className="mt-2 text-sm text-slate-600">Vai trò tài khoản hiện tại không thể truy cập trang này.</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <DashboardLayout />
          </Protected>
        }
      >
        <Route index element={<RoleHomeRedirect />} />
        <Route
          path="dashboard"
          element={
            <RequireRole allowedRoles={['ADMIN']}>
              <AdminHomePage />
            </RequireRole>
          }
        />
        <Route
          path="pending"
          element={
            <RequireRole allowedRoles={['ADMIN']}>
              <DashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="pois"
          element={
            <RequireRole allowedRoles={['ADMIN']}>
              <MasterPoisPage />
            </RequireRole>
          }
        />
        <Route
          path="audits"
          element={
            <RequireRole allowedRoles={['ADMIN']}>
              <AuditsPage />
            </RequireRole>
          }
        />
        <Route
          path="intelligence/dashboard"
          element={
            <RequireRole allowedRoles={['ADMIN']}>
              <IntelligenceDashboard />
            </RequireRole>
          }
        />
        <Route
          path="audio-analytics"
          element={
            <RequireRole allowedRoles={['ADMIN']}>
              <AudioAnalyticsPage />
            </RequireRole>
          }
        />
        <Route
          path="users"
          element={
            <RequireRole allowedRoles={['ADMIN']}>
              <UserManagementPage />
            </RequireRole>
          }
        />
        <Route
          path="devices"
          element={
            <RequireRole allowedRoles={['ADMIN']}>
              <DeviceManagementPage />
            </RequireRole>
          }
        />
        <Route
          path="change-requests"
          element={
            <RequireRole allowedRoles={['ADMIN']}>
              <AdminChangeRequestsPage />
            </RequireRole>
          }
        />
        <Route
          path="zones"
          element={
            <RequireRole allowedRoles={['ADMIN']}>
              <ZonesManagementPage />
            </RequireRole>
          }
        />
        <Route
          path="my-pois"
          element={
            <RequireRole allowedRoles={['OWNER']}>
              <OwnerSubmissionsPage />
            </RequireRole>
          }
        />
        <Route
          path="submit-poi"
          element={
            <RequireRole allowedRoles={['OWNER']}>
              <SubmitPoiPage />
            </RequireRole>
          }
        />
      </Route>
      <Route path="/forbidden" element={<ForbiddenPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
