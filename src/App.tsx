import { Navigate, Route, Routes } from "react-router-dom";
import AdminDashboard from "./pages/AdminDashboard";
import AssetViewerPage from "./pages/AssetViewerPage";
import CreateWorkOrderPage from "./pages/CreateWorkOrderPage";
import LoginPage from "./pages/LoginPage";
import UpdateWorkOrderPage from "./pages/UpdateWorkOrderPage";
import ApiLogsPage from "./pages/admin/ApiLogsPage";
import WorkflowExecutionsPage from "./pages/admin/WorkflowExecutionsPage";
import EnvironmentsPage from "./pages/admin/EnvironmentsPage";
import ExternalViewsPage from "./pages/admin/ExternalViewsPage";
import RolesPage from "./pages/admin/RolesPage";
import AuthenticationProfilesPage from "./pages/admin/AuthenticationProfilesPage";
import UsersPage from "./pages/admin/UsersPage";
import OrganizationsPage from "./pages/admin/OrganizationsPage";
import FormBuilderListPage from "./pages/integration/FormBuilderListPage";
import FormBuilderWizardPage from "./pages/integration/FormBuilderWizardPage";
import FormDesignerPage from "./pages/integration/FormDesignerPage";
import FormPreviewPage from "./pages/integration/FormPreviewPage";
import SubmissionListPage from "./pages/integration/SubmissionListPage";
import UserFormPage from "./pages/integration/UserFormPage";
import RpaTestPage from "./pages/RpaTestPage";
import MessagingPage from "./pages/admin/MessagingPage";
import ServiceBusLogsPage from "./pages/admin/ServiceBusLogsPage";
import AnalyticsListPage from "./pages/integration/AnalyticsListPage";
import AnalyticsBuilderPage from "./pages/integration/AnalyticsBuilderPage";
import PublicAnalyticsPage from "./pages/integration/PublicAnalyticsPage";

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
      <Route
        path="/admin/authentication-profiles"
        element={<AuthenticationProfilesPage />}
      />
      <Route path="/roles.html" element={<RolesPage />} />
      <Route path="/admin/users" element={<UsersPage />} />
      <Route path="/admin/organizations" element={<OrganizationsPage />} />
      <Route path="/users.html" element={<UsersPage />} />
      <Route path="/admin/api-logs" element={<ApiLogsPage />} />
      <Route path="/admin/service-bus-logs" element={<ServiceBusLogsPage />} />
      <Route
        path="/admin/workflow-executions"
        element={<WorkflowExecutionsPage />}
      />
      <Route path="/api-logs.html" element={<ApiLogsPage />} />
      <Route
        path="/admin/integration/form-builder"
        element={<FormBuilderListPage />}
      />
      <Route
        path="/admin/integration/form-builder/new"
        element={<FormBuilderWizardPage />}
      />
      <Route
        path="/admin/integration/form-builder/:formId/design"
        element={<FormDesignerPage />}
      />
      <Route
        path="/admin/integration/form-builder/:formId/preview"
        element={<FormPreviewPage />}
      />
      <Route
        path="/admin/integration/form-builder/:formId/submissions"
        element={<SubmissionListPage />}
      />
      <Route path="/forms/:formId" element={<UserFormPage />} />
      <Route path="/admin/integration/messaging" element={<MessagingPage />} />
      <Route
        path="/admin/integration/analytics"
        element={<AnalyticsListPage />}
      />
      <Route
        path="/admin/integration/analytics/new"
        element={<AnalyticsBuilderPage />}
      />
      <Route
        path="/admin/integration/analytics/:analyticsId/design"
        element={<AnalyticsBuilderPage />}
      />
      <Route path="/analytics/:analyticsId" element={<PublicAnalyticsPage />} />
      <Route path="/rpa-test" element={<RpaTestPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
