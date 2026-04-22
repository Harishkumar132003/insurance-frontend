import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function FeatureGate({ feature, children, fallback = '/' }) {
  const { hasFeature, loading } = useAuth();
  if (loading) return null;
  if (!hasFeature(feature)) return <Navigate to={fallback} replace />;
  return children;
}
