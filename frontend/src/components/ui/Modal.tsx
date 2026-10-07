import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';
import { XIcon } from './icons';
import { Button } from './Button';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Explicit dirty flag; otherwise tracked from children via `useModalDirty`. */
  dirty?: boolean;
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' } as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const ModalDirtyContext = createContext<((dirty: boolean) => void) | null>(null);

/**
 * Reports whether the form inside a Modal has unsaved changes. When there are
 * unsaved changes the modal asks before discarding instead of closing.
 * No-op when used outside a Modal (e.g. components rendered standalone).
 */
export function useModalDirty(dirty: boolean): void {
  const setDirty = useContext(ModalDirtyContext);
  useEffect(() => {
    if (!setDirty) return undefined;
    setDirty(dirty);
    return () => setDirty(false);
  }, [dirty, setDirty]);
}

/**
 * Accessible modal dialog: labelled, focus-trapped, Escape-closable and it
 * restores focus to the previously active element on close. Unsaved changes
 * are protected with a confirmation step.
 */
export function Modal({ open, onClose, title, description, children, footer, size = 'md', dirty }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [formDirty, setFormDirty] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);

  const isDirty = dirty ?? formDirty;
  // Keep the latest onClose without re-running the focus effect on every render
  // (a re-run would steal focus from inputs on each keystroke).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;
  const pendingCloseRef = useRef(pendingClose);
  pendingCloseRef.current = pendingClose;

  const attemptClose = useCallback(() => {
    if (isDirtyRef.current) setPendingClose(true);
    else onCloseRef.current();
  }, []);
  const attemptCloseRef = useRef(attemptClose);
  attemptCloseRef.current = attemptClose;

  useEffect(() => {
    if (!open) return undefined;

    setPendingClose(false);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    // Prefer an explicit target, then the first form control (so forms open on
    // their first field rather than the header close button), then anything.
    const initialTarget =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ??
      focusables()[0];
    if (initialTarget) initialTarget.focus();
    else panel?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (pendingCloseRef.current) setPendingClose(false);
        else attemptCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  // Warn before a full page unload while a form has unsaved changes.
  useEffect(() => {
    if (!open || !isDirty) return undefined;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [open, isDirty]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={attemptClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl dark:bg-slate-900',
          SIZES[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-slate-900 dark:text-white">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={attemptClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <XIcon className="text-base" />
          </button>
        </div>

        <ModalDirtyContext.Provider value={setFormDirty}>
          <div className="flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
        </ModalDirtyContext.Provider>

        {pendingClose ? (
          <div
            role="alertdialog"
            aria-label="Discard unsaved changes"
            className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-900 dark:bg-amber-950/40"
          >
            <p className="text-sm text-amber-800 dark:text-amber-200">You have unsaved changes. Discard them?</p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" data-autofocus onClick={() => setPendingClose(false)}>
                Keep editing
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setPendingClose(false);
                  onCloseRef.current();
                }}
              >
                Discard
              </Button>
            </div>
          </div>
        ) : (
          footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
              {footer}
            </div>
          )
        )}
      </div>
    </div>,
    document.body,
  );
}
