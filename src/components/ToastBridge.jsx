import { useEffect } from 'react';
import { useToast, registerToast } from './Toast';

export default function ToastBridge() {
  const toast = useToast();
  useEffect(() => {
    registerToast(toast);
  }, [toast]);
  return null;
}
