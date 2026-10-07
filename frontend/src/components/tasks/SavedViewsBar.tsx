import { useState } from 'react';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { useSavedViewMutations, useSavedViews } from '../../features/projects/queries';
import type { TaskFilters } from '../../features/tasks/types';
import { cn } from '../../lib/cn';
import { toast } from '../../stores/toastStore';

export interface SavedViewsBarProps {
  projectId: string;
  currentFilters: TaskFilters;
  activeViewId?: string;
  onApply: (filters: TaskFilters, viewId?: string) => void;
}

/** Chips for stored filter combinations plus "save current view". */
export function SavedViewsBar({ projectId, currentFilters, activeViewId, onApply }: SavedViewsBarProps) {
  const views = useSavedViews(projectId);
  const { create, remove } = useSavedViewMutations(projectId);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const items = views.data?.savedViews ?? [];

  const handleSave = () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast.error('Name is required', 'Use at least two characters.');
      return;
    }
    create.mutate(
      { name: trimmed, filters: currentFilters as Record<string, unknown>, isDefault },
      {
        onSuccess: () => {
          toast.success('View saved', trimmed);
          setSaveOpen(false);
          setName('');
          setIsDefault(false);
        },
        onError: (error) => toast.error('Could not save view', error.message),
      },
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">Views</span>

      {items.length === 0 && <span className="text-xs text-slate-400 dark:text-slate-500">No saved views yet.</span>}

      {items.map((view) => (
        <span
          key={view.id}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs',
            activeViewId === view.id
              ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300'
              : 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300',
          )}
        >
          <button
            type="button"
            onClick={() => onApply(view.filters as TaskFilters, view.id)}
            className="font-medium hover:text-indigo-600 dark:hover:text-indigo-400"
          >
            {view.name}
            {view.isDefault && <span title="Default view"> ★</span>}
          </button>
          <button
            type="button"
            aria-label={`Delete saved view ${view.name}`}
            onClick={() => setPendingDelete({ id: view.id, name: view.name })}
            className="rounded-full px-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-100"
          >
            ×
          </button>
        </span>
      ))}

      <Button variant="ghost" size="sm" onClick={() => setSaveOpen(true)}>
        Save current view
      </Button>

      <Modal open={saveOpen} onClose={() => setSaveOpen(false)} title="Save current view" size="sm">
        <div className="space-y-4">
          <Input
            label="View name"
            placeholder="My high priority tasks"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-indigo-600 dark:border-slate-600"
            />
            Make this my default view for this project
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Saved views keep the current filters and search; they are personal to your account.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={create.isPending}>
              Save view
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete saved view"
        description={pendingDelete ? `Delete the saved view "${pendingDelete.name}"? This cannot be undone.` : ''}
        confirmLabel="Delete view"
        loading={remove.isPending}
        onConfirm={() => {
          if (pendingDelete) {
            const target = pendingDelete;
            remove.mutate(target.id, {
              onSuccess: () => toast.success('View deleted', target.name),
              onError: (error) => toast.error('Could not delete view', error.message),
            });
          }
          setPendingDelete(null);
        }}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
