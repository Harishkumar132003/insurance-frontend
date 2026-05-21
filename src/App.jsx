import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import ToastBridge from './components/ToastBridge';
import { AuthProvider, ROLES } from './context/AuthContext';
import { NotificationsProvider } from './context/NotificationsContext';
import PrivateRoute from './components/PrivateRoute';
import FeatureGate from './components/FeatureGate';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Hospitals from './pages/Hospitals';
import Users from './pages/Users';
import ManageUsers from './pages/ManageUsers';
import HospitalInfo from './pages/HospitalInfo';
import Configurations from './pages/Configurations';
import RunWorkflow from './pages/RunWorkflow';
import ClaimList from './pages/ClaimList';
import PreAuthForm from './pages/PreAuthForm';
import PreAuthFormPage from './pages/PreAuthFormPage';
import PreAuthPrint from './pages/PreAuthPrint';
import PreAuthChoicePage from './pages/PreAuthChoicePage';
import PreAuthAIFillPage from './pages/PreAuthAIFillPage';
import ClaimRaisePage from './pages/ClaimRaisePage';
import Email from './pages/Email';
import Prompts from './pages/Prompts';
import SummaryPrompts from './pages/SummaryPrompts';
import PolicyProviders from './pages/PolicyProviders';
import Logs from './pages/Logs';
import GlobalVariablesPage from './pages/GlobalVariablesPage';
import QueryManagement from './pages/QueryManagement';
import ProviderQueue from './pages/ProviderQueue';
import ProviderClaimDetail from './pages/ProviderClaimDetail';
import ProviderOnboarding from './pages/ProviderOnboarding';
import './styles/global.scss';

const { SUPER_ADMIN, HOSPITAL_ADMIN, INSURANCE_PROVIDER } = ROLES;

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <ToastBridge />
        <AuthProvider>
          <NotificationsProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <PrivateRoute>
                  <Layout />
                </PrivateRoute>
              }
            >
              {/* Both roles */}
              <Route
                path="/"
                element={
                  <FeatureGate feature="dashboard"><Dashboard /></FeatureGate>
                }
              />
              <Route
                path="/configurations"
                element={
                  <FeatureGate feature="configurations"><Configurations /></FeatureGate>
                }
              />
              <Route
                path="/configurations/:hospitalId"
                element={
                  <PrivateRoute allowedRoles={[SUPER_ADMIN]}>
                    <FeatureGate feature="configurations"><GlobalVariablesPage /></FeatureGate>
                  </PrivateRoute>
                }
              />
              <Route path="/logs" element={<Logs />} />

              {/* Super Admin only */}
              <Route
                path="/hospitals"
                element={
                  <PrivateRoute allowedRoles={[SUPER_ADMIN]}>
                    <FeatureGate feature="hospitals"><Hospitals /></FeatureGate>
                  </PrivateRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <PrivateRoute allowedRoles={[SUPER_ADMIN]}>
                    <FeatureGate feature="users"><Users /></FeatureGate>
                  </PrivateRoute>
                }
              />
              <Route
                path="/prompts"
                element={
                  <PrivateRoute allowedRoles={[SUPER_ADMIN]}>
                    <FeatureGate feature="prompts"><Prompts /></FeatureGate>
                  </PrivateRoute>
                }
              />
              <Route
                path="/summary-prompts"
                element={
                  <PrivateRoute allowedRoles={[SUPER_ADMIN]}>
                    <FeatureGate feature="summary_prompts"><SummaryPrompts /></FeatureGate>
                  </PrivateRoute>
                }
              />
              <Route
                path="/policy-providers"
                element={
                  <PrivateRoute allowedRoles={[SUPER_ADMIN]}>
                    <FeatureGate feature="policy_providers"><PolicyProviders /></FeatureGate>
                  </PrivateRoute>
                }
              />

              {/* Hospital Admin + Insurance Provider */}
              <Route
                path="/claim-list"
                element={
                  <PrivateRoute allowedRoles={[HOSPITAL_ADMIN, INSURANCE_PROVIDER]}>
                    <FeatureGate feature="preauth_list"><ClaimList /></FeatureGate>
                  </PrivateRoute>
                }
              />
              <Route
                path="/claims"
                element={
                  <PrivateRoute allowedRoles={[HOSPITAL_ADMIN, INSURANCE_PROVIDER]}>
                    <FeatureGate feature="preauth_list"><ClaimList approvedOnly /></FeatureGate>
                  </PrivateRoute>
                }
              />
              <Route
                path="/claims/:claimCaseId"
                element={
                  <PrivateRoute allowedRoles={[HOSPITAL_ADMIN]}>
                    <FeatureGate feature="preauth_list"><PreAuthForm /></FeatureGate>
                  </PrivateRoute>
                }
              />
              <Route
                path="/claim-list/:claimCaseId"
                element={
                  <PrivateRoute allowedRoles={[HOSPITAL_ADMIN, INSURANCE_PROVIDER]}>
                    <FeatureGate feature="preauth_list"><PreAuthForm /></FeatureGate>
                  </PrivateRoute>
                }
              />
              <Route
                path="/pre-auth-print/:claimCaseId"
                element={
                  <PrivateRoute allowedRoles={[HOSPITAL_ADMIN]}>
                    <FeatureGate feature="preauth_list"><PreAuthPrint /></FeatureGate>
                  </PrivateRoute>
                }
              />
              <Route
                path="/query-management"
                element={
                  <PrivateRoute allowedRoles={[HOSPITAL_ADMIN, INSURANCE_PROVIDER]}>
                    <FeatureGate feature="query_management"><QueryManagement /></FeatureGate>
                  </PrivateRoute>
                }
              />

              {/* Insurance Provider only */}
              <Route
                path="/provider-queue"
                element={
                  <PrivateRoute allowedRoles={[INSURANCE_PROVIDER]}>
                    <ProviderQueue />
                  </PrivateRoute>
                }
              />
              <Route
                path="/provider-queue/:claimCaseId"
                element={
                  <PrivateRoute allowedRoles={[INSURANCE_PROVIDER]}>
                    <ProviderClaimDetail />
                  </PrivateRoute>
                }
              />
              <Route
                path="/pre-auth"
                element={
                  <PrivateRoute allowedRoles={[HOSPITAL_ADMIN]}>
                    <FeatureGate feature="preauth_form"><PreAuthChoicePage /></FeatureGate>
                  </PrivateRoute>
                }
              />
              <Route
                path="/pre-auth/ai"
                element={
                  <PrivateRoute allowedRoles={[HOSPITAL_ADMIN]}>
                    <FeatureGate feature="preauth_form"><PreAuthAIFillPage /></FeatureGate>
                  </PrivateRoute>
                }
              />
              <Route
                path="/pre-auth/manual"
                element={
                  <PrivateRoute allowedRoles={[HOSPITAL_ADMIN]}>
                    <FeatureGate feature="preauth_form"><PreAuthFormPage key="new" /></FeatureGate>
                  </PrivateRoute>
                }
              />
              <Route
                path="/pre-auth/:claimCaseId"
                element={
                  <PrivateRoute allowedRoles={[HOSPITAL_ADMIN]}>
                    <FeatureGate feature="preauth_form"><PreAuthFormPage key="edit" /></FeatureGate>
                  </PrivateRoute>
                }
              />
              <Route
                path="/claim/:claimCaseId"
                element={
                  <PrivateRoute allowedRoles={[HOSPITAL_ADMIN]}>
                    <FeatureGate feature="preauth_form"><ClaimRaisePage /></FeatureGate>
                  </PrivateRoute>
                }
              />
              <Route
                path="/email"
                element={
                  <PrivateRoute allowedRoles={[HOSPITAL_ADMIN]}>
                    <Email />
                  </PrivateRoute>
                }
              />
              <Route
                path="/run-workflow"
                element={
                  <PrivateRoute allowedRoles={[HOSPITAL_ADMIN]}>
                    <RunWorkflow />
                  </PrivateRoute>
                }
              />
              <Route
                path="/manage-users"
                element={
                  <PrivateRoute allowedRoles={[HOSPITAL_ADMIN]}>
                    <FeatureGate feature="manage_users"><ManageUsers /></FeatureGate>
                  </PrivateRoute>
                }
              />
              <Route
                path="/hospital-info"
                element={
                  <PrivateRoute allowedRoles={[HOSPITAL_ADMIN]}>
                    <FeatureGate feature="hospital_info"><HospitalInfo /></FeatureGate>
                  </PrivateRoute>
                }
              />
              <Route
                path="/provider-onboarding"
                element={
                  <PrivateRoute allowedRoles={[HOSPITAL_ADMIN]}>
                    <ProviderOnboarding />
                  </PrivateRoute>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </NotificationsProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
