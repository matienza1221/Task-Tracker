import { useState } from 'react';
import { Modal } from './Modal';
import { Button, type ButtonVariant } from './Button';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ButtonVariant;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button data-autofocus variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">{description}</p>
    </Modal>
  );
}

/** Imperative helper for one-off confirmations inside event handlers. */
export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({ open: false, title: '', description: '', onConfirm: () => undefined });

  const confirm = (options: { title: string; description: string; onConfirm: () => void }) =>
    setState({ open: true, ...options });

  const dialog = (
    <ConfirmDialog
      open={state.open}
      title={state.title}
      description={state.description}
      onConfirm={() => {
        state.onConfirm();
        setState((prev) => ({ ...prev, open: false }));
      }}
      onClose={() => setState((prev) => ({ ...prev, open: false }))}
    />
  );

  return { confirm, dialog };
}
