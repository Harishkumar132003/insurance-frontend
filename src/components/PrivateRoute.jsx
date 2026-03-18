import { Navigate } from 'react-router-dom';
import { useAuth, ROLES } from '../context/AuthContext';
import Spinner from './Spinner';

export default function PrivateRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect unauthorized role to their default page
    const fallback = user.role === ROLES.SUPER_ADMIN ? '/' : '/run-workflow';
    return <Navigate to={fallback} replace />;
  }

  return children;
}
