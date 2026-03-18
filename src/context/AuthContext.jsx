import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

// Roles
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  HOSPITAL_ADMIN: 'HOSPITAL_ADMIN',
};

function decodeToken(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      email: payload.sub || payload.email,
      role: payload.role,
      hospital_id: payload.hospital_id || null,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      const decoded = decodeToken(token);
      if (decoded) {
        setUser(decoded);
      } else {
        // Token invalid, clear it
        localStorage.removeItem('access_token');
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    const { access_token } = response.data;

    localStorage.setItem('access_token', access_token);

    const decoded = decodeToken(access_token);
    if (decoded) {
      localStorage.setItem('user', JSON.stringify(decoded));
      setUser(decoded);
      return decoded;
    }

    // Fallback: if token doesn't contain role info, use response data
    const userData = {
      email: response.data.email || email,
      role: response.data.role || ROLES.HOSPITAL_ADMIN,
      hospital_id: response.data.hospital_id || null,
    };
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const isSuperAdmin = user?.role === ROLES.SUPER_ADMIN;
  const isHospitalAdmin = user?.role === ROLES.HOSPITAL_ADMIN;

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        loading,
        isAuthenticated: !!user,
        isSuperAdmin,
        isHospitalAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
