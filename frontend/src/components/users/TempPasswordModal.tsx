import { useState } from 'react';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ClipboardIcon } from '../ui/clipboard-icon';
import { toast } from '../../stores/toastStore';

/** Displays a generated password exactly once, with a copy affordance. */
export function TempPasswordModal({
  open,
  onClose,
  password,
  forUser,
}: {
  open: boolean;
  onClose: () => void;
  password: string | null;
  forUser: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      toast.success('Password copied');
    } catch {
      toast.error('Copy failed', 'Select the password and copy it manually.');
    }
  };

  return (
    <Modal
      open={open && Boolean(password)}
      onClose={onClose}
      title="Temporary password"
      description={`Share this password with ${forUser} through a secure channel. It is shown only once.`}
      size="md"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-3">
        <Alert variant="warning" title="This will not be shown again">
          The user must change this password immediately after signing in.
        </Alert>
        <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
          <code className="flex-1 font-mono text-sm break-all text-slate-900 dark:text-slate-100">{password}</code>
          <Button variant="secondary" size="sm" onClick={copy} aria-label="Copy password">
            <ClipboardIcon className="text-base" />
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
