import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

// Roles
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  HOSPITAL_ADMIN: 'HOSPITAL_ADMIN',
  INSURANCE_PROVIDER: 'INSURANCE_PROVIDER',
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
        // Merge any persisted access list from the prior login
        try {
          const stored = JSON.parse(localStorage.getItem('user') || 'null');
          if (stored && Array.isArray(stored.access)) {
            decoded.access = stored.access;
          }
        } catch {
          // ignore malformed user blob
        }
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
    const { access_token, hospital, provider, access } = response.data;

    localStorage.setItem('access_token', access_token);

    // Store hospital details if present
    if (hospital) {
      localStorage.setItem('hospital', JSON.stringify(hospital));
    }

    // Store provider details if present (INSURANCE_PROVIDER role)
    if (provider) {
      localStorage.setItem('provider', JSON.stringify(provider));
    }

    const decoded = decodeToken(access_token);
    const base = decoded || {
      email: response.data.email || email,
      role: response.data.role || ROLES.HOSPITAL_ADMIN,
      hospital_id: response.data.hospital_id || null,
    };
    const userData = {
      ...base,
      access: Array.isArray(access) ? access : null,
    };
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    localStorage.removeItem('hospital');
    localStorage.removeItem('provider');
    setUser(null);
  };

  const isSuperAdmin = user?.role === ROLES.SUPER_ADMIN;
  const isHospitalAdmin = user?.role === ROLES.HOSPITAL_ADMIN;

  const hasFeature = (key) => {
    if (!key) return true;
    if (isSuperAdmin) return true;
    if (!user) return false;
    // Backend expands NULL → full access server-side; null on the client also means unrestricted.
    if (user.access == null) return true;
    return Array.isArray(user.access) && user.access.includes(key);
  };

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
        hasFeature,
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
