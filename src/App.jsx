import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import ToastBridge from './components/ToastBridge';
import { AuthProvider, ROLES } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Hospitals from './pages/Hospitals';
import Users from './pages/Users';
import Configurations from './pages/Configurations';
import RunWorkflow from './pages/RunWorkflow';
import Prompts from './pages/Prompts';
import PolicyProviders from './pages/PolicyProviders';
import Logs from './pages/Logs';
import './styles/global.scss';

const { SUPER_ADMIN, HOSPITAL_ADMIN } = ROLES;

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <ToastBridge />
        <AuthProvider>
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
              <Route path="/" element={<Dashboard />} />
              <Route path="/configurations" element={<Configurations />} />
              <Route path="/logs" element={<Logs />} />

              {/* Super Admin only */}
              <Route
                path="/hospitals"
                element={
                  <PrivateRoute allowedRoles={[SUPER_ADMIN]}>
                    <Hospitals />
                  </PrivateRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <PrivateRoute allowedRoles={[SUPER_ADMIN]}>
                    <Users />
                  </PrivateRoute>
                }
              />
              <Route
                path="/prompts"
                element={
                  <PrivateRoute allowedRoles={[SUPER_ADMIN]}>
                    <Prompts />
                  </PrivateRoute>
                }
              />
              <Route
                path="/policy-providers"
                element={
                  <PrivateRoute allowedRoles={[SUPER_ADMIN]}>
                    <PolicyProviders />
                  </PrivateRoute>
                }
              />

              {/* Hospital Admin only */}
              <Route
                path="/run-workflow"
                element={
                  <PrivateRoute allowedRoles={[HOSPITAL_ADMIN]}>
                    <RunWorkflow />
                  </PrivateRoute>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
