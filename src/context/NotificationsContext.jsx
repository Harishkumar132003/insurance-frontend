import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth, ROLES } from './AuthContext';
import { claimCaseService } from '../services/api';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

const NotificationsContext = createContext({
  unreadCount: 0,
  subscribe: () => () => {},
  refresh: () => {},
});

/**
 * Wraps the app and maintains a real-time uncategorized-email feed via SSE.
 *
 * - Hospital-admin only. Other roles get a no-op provider (no EventSource,
 *   no fetches) so this can't slow them down or break their auth.
 * - Initial count is fetched once on mount; SSE pushes bump it optimistically.
 * - Consumers can subscribe to raw events (e.g. QueryManagement refetches its
 *   list when an `email.received` event arrives) without re-rendering.
 * - `refresh()` re-syncs the count from the server — call it after any flow
 *   that marks an email as read (e.g. successful categorize-save).
 */
export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const subscribersRef = useRef(new Set());
  const esRef = useRef(null);

  const isHospitalAdmin = user?.role === ROLES.HOSPITAL_ADMIN;

  const refresh = useCallback(() => {
    if (!isHospitalAdmin) return;
    claimCaseService.getUncategorizedCount()
      .then((res) => setUnreadCount(res?.data?.total ?? 0))
      .catch(() => { /* leave count as is on transient errors */ });
  }, [isHospitalAdmin]);

  useEffect(() => {
    if (!isHospitalAdmin) {
      setUnreadCount(0);
      return undefined;
    }
    refresh();
    const token = localStorage.getItem('access_token');
    if (!token) return undefined;

    // EventSource can't send custom headers — JWT goes via query param.
    const url = `${API_BASE}/events/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    const handleEmailReceived = (evt) => {
      let data = {};
      try { data = JSON.parse(evt.data || '{}'); } catch { /* ignore */ }
      setUnreadCount((c) => c + 1);
      subscribersRef.current.forEach((cb) => {
        try { cb(data); } catch { /* never let one subscriber break the rest */ }
      });
    };
    es.addEventListener('email.received', handleEmailReceived);
    // `ready` and `ping` are informational — no handler needed. Browser
    // EventSource auto-reconnects on transient drops.

    return () => {
      es.removeEventListener('email.received', handleEmailReceived);
      es.close();
      esRef.current = null;
    };
  }, [isHospitalAdmin, refresh]);

  const subscribe = useCallback((cb) => {
    subscribersRef.current.add(cb);
    return () => { subscribersRef.current.delete(cb); };
  }, []);

  return (
    <NotificationsContext.Provider value={{ unreadCount, subscribe, refresh }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationsContext);
