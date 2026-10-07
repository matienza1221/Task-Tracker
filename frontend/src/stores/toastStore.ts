import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
}

interface ToastState {
  toasts: Toast[];
  paused: boolean;
  push: (toast: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
  setPaused: (paused: boolean) => void;
}

const AUTO_DISMISS_MS = 6000;
const MAX_VISIBLE = 4;

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function clearTimer(id: string): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

export const useToastStore = create<ToastState>((set, get) => {
  const schedule = (id: string) => {
    clearTimer(id);
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));
      }, AUTO_DISMISS_MS),
    );
  };

  return {
    toasts: [],
    paused: false,
    push: (toast) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      set((state) => {
        const toasts = [...state.toasts, { ...toast, id }];
        // Cap the stack so a burst of events cannot cover the screen.
        const overflow = toasts.length - MAX_VISIBLE;
        if (overflow > 0) toasts.splice(0, overflow);
        return { toasts };
      });
      if (!get().paused) schedule(id);
      return id;
    },
    dismiss: (id) => {
      clearTimer(id);
      set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));
    },
    setPaused: (paused) => {
      set({ paused });
      if (paused) {
        for (const id of timers.keys()) clearTimer(id);
      } else {
        for (const item of get().toasts) schedule(item.id);
      }
    },
  };
});

export const toast = {
  success: (title: string, description?: string) => useToastStore.getState().push({ variant: 'success', title, description }),
  error: (title: string, description?: string) => useToastStore.getState().push({ variant: 'error', title, description }),
  info: (title: string, description?: string) => useToastStore.getState().push({ variant: 'info', title, description }),
};
