import { Navigate, Route, Routes } from 'react-router-dom';
import AdminDashboard from './pages/AdminDashboard';
import AssetViewerPage from './pages/AssetViewerPage';
import CreateWorkOrderPage from './pages/CreateWorkOrderPage';
import LoginPage from './pages/LoginPage';
import UpdateWorkOrderPage from './pages/UpdateWorkOrderPage';
import ApiLogsPage from './pages/admin/ApiLogsPage';
import EnvironmentsPage from './pages/admin/EnvironmentsPage';
import ExternalViewsPage from './pages/admin/ExternalViewsPage';
import RolesPage from './pages/admin/RolesPage';
import UsersPage from './pages/admin/UsersPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AssetViewerPage />} />
      <Route path="/index.html" element={<AssetViewerPage />} />
      <Route path="/work-order" element={<CreateWorkOrderPage />} />
      <Route path="/work-order.html" element={<CreateWorkOrderPage />} />
      <Route path="/work-order-update" element={<UpdateWorkOrderPage />} />
      <Route path="/work-order-update.html" element={<UpdateWorkOrderPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/login.html" element={<LoginPage />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/admin.html" element={<AdminDashboard />} />
      <Route path="/admin/maximo-environments" element={<EnvironmentsPage />} />
      <Route path="/maximo-environments.html" element={<EnvironmentsPage />} />
      <Route path="/admin/external-views" element={<ExternalViewsPage />} />
      <Route path="/external-views.html" element={<ExternalViewsPage />} />
      <Route path="/admin/roles" element={<RolesPage />} />
      <Route path="/roles.html" element={<RolesPage />} />
      <Route path="/admin/users" element={<UsersPage />} />
      <Route path="/users.html" element={<UsersPage />} />
      <Route path="/admin/api-logs" element={<ApiLogsPage />} />
      <Route path="/api-logs.html" element={<ApiLogsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
