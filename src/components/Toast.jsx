import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { IconCheck, IconAlertCircle, IconInfo, IconX } from './icons/Icons';
import './Toast.scss';

const ToastContext = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
  }, []);

  const addToast = useCallback((message, type = 'success', duration = 3000) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type, exiting: false }]);
    if (duration > 0) {
      setTimeout(() => removeToast(id), duration);
    }
    return id;
  }, [removeToast]);

  const toast = useCallback(
    Object.assign((message, duration) => addToast(message, 'success', duration), {
      success: (message, duration) => addToast(message, 'success', duration),
      error: (message, duration) => addToast(message, 'error', duration),
      info: (message, duration) => addToast(message, 'info', duration),
    }),
    [addToast]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }) {
  const iconMap = {
    success: <IconCheck size={18} />,
    error: <IconAlertCircle size={18} />,
    info: <IconInfo size={18} />,
  };

  return (
    <div className={`toast toast--${toast.type} ${toast.exiting ? 'toast--exit' : ''}`}>
      <span className="toast__icon">{iconMap[toast.type]}</span>
      <span className="toast__message">{toast.message}</span>
      <button className="toast__close" onClick={onClose}>
        <IconX size={14} />
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

// Singleton toast for use outside React components (e.g. API interceptors)
let _singletonToast = null;

export function registerToast(toastFn) {
  _singletonToast = toastFn;
}

export function toast(message, duration) {
  _singletonToast?.success(message, duration);
}

toast.success = (message, duration) => _singletonToast?.success(message, duration);
toast.error = (message, duration) => _singletonToast?.error(message, duration);
toast.info = (message, duration) => _singletonToast?.info(message, duration);
