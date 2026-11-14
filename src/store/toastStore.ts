'use client';

import { create } from 'zustand';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  details?: string;
  autoHide?: boolean;
  duration?: number;
  dedupeKey?: string;
  count?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id' | 'count'>) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => set((state) => {
    const duplicate = state.toasts.find((existing) => {
      if (existing.type !== toast.type) return false;
      if (toast.dedupeKey !== undefined || existing.dedupeKey !== undefined) {
        return toast.dedupeKey === existing.dedupeKey;
      }
      // Different action callbacks may refer to different resources.
      return existing.message === toast.message && existing.details === toast.details
        && existing.action?.label === toast.action?.label
        && existing.action?.onClick === toast.action?.onClick;
    });
    if (duplicate) {
      return { toasts: state.toasts.map((existing) => existing.id === duplicate.id
        ? { ...existing, message: toast.message, details: toast.details, action: toast.action, count: (existing.count ?? 1) + 1 }
        : existing) };
    }
    return { toasts: [
      ...state.toasts,
      {
        ...toast,
        id: crypto.randomUUID(),
        count: 1,
        autoHide: toast.autoHide ?? true,
        duration: toast.duration ?? (toast.type === 'error' ? 8000 : 5000),
      },
    ].slice(-3) };
  }),
  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter((t) => t.id !== id),
  })),
  clearToasts: () => set({ toasts: [] }),
}));

// Helper functions for easy usage
export const toast = {
  success: (message: string, details?: string, action?: { label: string; onClick: () => void }) => 
    useToastStore.getState().addToast({ type: 'success', message, details, action }),
  error: (message: string, details?: string, action?: Toast['action'], options?: Pick<Toast, 'autoHide' | 'duration' | 'dedupeKey'>) =>
    useToastStore.getState().addToast({ type: 'error', message, details, action, ...options }),
  warning: (message: string, details?: string, action?: { label: string; onClick: () => void }) => 
    useToastStore.getState().addToast({ type: 'warning', message, details, action }),
  info: (message: string, details?: string, action?: { label: string; onClick: () => void }) => 
    useToastStore.getState().addToast({ type: 'info', message, details, action }),
};
