import { useState } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { useCreateVocabularyItem, useDeleteVocabularyItem, useUpdateVocabularyItem } from '../../features/vocabularies/queries';
import type { VocabularyItem, VocabularyKind } from '../../features/vocabularies/types';
import { toast } from '../../stores/toastStore';

export interface VocabularySectionProps {
  kind: VocabularyKind;
  title: string;
  description: string;
  items: VocabularyItem[];
  categoryOptions?: { value: string; label: string }[];
  showWeight?: boolean;
  showIcon?: boolean;
}

/**
 * One configurable vocabulary (task statuses, priorities, types, project
 * statuses): inline editing, defaults, activation and deletion rules are
 * enforced again on the server.
 */
export function VocabularySection({
  kind,
  title,
  description,
  items,
  categoryOptions,
  showWeight = false,
  showIcon = false,
}: VocabularySectionProps) {
  const createItem = useCreateVocabularyItem();
  const updateItem = useUpdateVocabularyItem();
  const deleteItem = useDeleteVocabularyItem();

  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState(categoryOptions?.[0]?.value ?? '');
  const [newWeight, setNewWeight] = useState('1');
  const [newIcon, setNewIcon] = useState('square');
  const [pendingDelete, setPendingDelete] = useState<VocabularyItem | null>(null);

  const handleCreate = () => {
    if (newName.trim().length === 0) {
      toast.error('Name is required');
      return;
    }
    createItem.mutate(
      {
        kind,
        name: newName.trim(),
        ...(categoryOptions ? { category: newCategory } : {}),
        ...(showWeight ? { weight: Number(newWeight) || 0 } : {}),
        ...(showIcon ? { icon: newIcon.trim() || 'square' } : {}),
      },
      {
        onSuccess: () => {
          toast.success(`${title.replace(/s$/, '')} created`);
          setNewName('');
        },
        onError: (error) => toast.error('Could not create entry', error.message),
      },
    );
  };

  const save = (item: VocabularyItem, input: Record<string, unknown>) =>
    updateItem.mutate(
      { kind, id: item.id, ...input },
      {
        onSuccess: () => toast.success('Saved'),
        onError: (error) => toast.error('Could not save', error.message),
      },
    );

  const remove = (item: VocabularyItem) => {
    const hard = !item.isSystem && item.usageCount === 0;
    deleteItem.mutate(
      { kind, id: item.id, hard },
      {
        onSuccess: () => toast.success(hard ? 'Entry deleted' : 'Entry deactivated'),
        onError: (error) => toast.error('Could not remove entry', error.message),
      },
    );
  };

  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
          <div className="min-w-[180px] flex-1">
            <Input
              label="New entry name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Awaiting QA"
            />
          </div>
          {categoryOptions && (
            <div className="w-48">
              <Select
                label="Category"
                options={categoryOptions}
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
              />
            </div>
          )}
          {showWeight && (
            <div className="w-28">
              <Input label="Weight" type="number" min="0" value={newWeight} onChange={(event) => setNewWeight(event.target.value)} />
            </div>
          )}
          {showIcon && (
            <div className="w-32">
              <Input label="Icon" value={newIcon} onChange={(event) => setNewIcon(event.target.value)} />
            </div>
          )}
          <Button onClick={handleCreate} loading={createItem.isPending}>
            Add
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
                <th scope="col" className="px-2 py-2 font-medium">Colour</th>
                <th scope="col" className="px-2 py-2 font-medium">Name</th>
                {categoryOptions && <th scope="col" className="px-2 py-2 font-medium">Category</th>}
                {showWeight && <th scope="col" className="px-2 py-2 font-medium">Weight</th>}
                {showIcon && <th scope="col" className="px-2 py-2 font-medium">Icon</th>}
                <th scope="col" className="px-2 py-2 font-medium">Order</th>
                <th scope="col" className="px-2 py-2 font-medium">Usage</th>
                <th scope="col" className="px-2 py-2 font-medium">Default</th>
                <th scope="col" className="px-2 py-2 font-medium">Active</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((item) => (
                <tr
                  key={`${item.id}-${item.name}-${item.color}-${item.category}-${item.weight}-${item.icon}-${item.sortOrder}-${item.isActive}-${item.isDefault}`}
                >
                  <td className="px-2 py-2">
                    <input
                      type="color"
                      aria-label={`Colour for ${item.name}`}
                      defaultValue={item.color}
                      disabled={updateItem.isPending}
                      onBlur={(event) => {
                        if (event.target.value !== item.color) save(item, { color: event.target.value });
                      }}
                      className="h-8 w-10 cursor-pointer rounded border border-slate-300 bg-transparent dark:border-slate-700"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      aria-label={`Name for ${item.name}`}
                      defaultValue={item.name}
                      disabled={updateItem.isPending}
                      onBlur={(event) => {
                        const value = event.target.value.trim();
                        if (value && value !== item.name) save(item, { name: value });
                      }}
                      className="w-44 rounded border border-transparent bg-transparent px-1.5 py-1 text-sm hover:border-slate-300 focus:border-indigo-500 focus:outline-none dark:hover:border-slate-600"
                    />
                    <span className="ml-1 font-mono text-[10px] text-slate-400">{item.key}</span>
                  </td>
                  {categoryOptions && (
                    <td className="px-2 py-2">
                      <Select
                        label=""
                        aria-label={`Category for ${item.name}`}
                        className="w-40"
                        options={categoryOptions}
                        value={item.category ?? ''}
                        disabled={updateItem.isPending}
                        onChange={(event) => save(item, { category: event.target.value })}
                      />
                    </td>
                  )}
                  {showWeight && (
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        aria-label={`Weight for ${item.name}`}
                        defaultValue={item.weight ?? 0}
                        disabled={updateItem.isPending}
                        onBlur={(event) => {
                          const value = Number(event.target.value);
                          if (!Number.isNaN(value) && value !== item.weight) save(item, { weight: value });
                        }}
                        className="w-16 rounded border border-slate-300 bg-white px-1.5 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                      />
                    </td>
                  )}
                  {showIcon && (
                    <td className="px-2 py-2">
                      <input
                        aria-label={`Icon for ${item.name}`}
                        defaultValue={item.icon ?? ''}
                        disabled={updateItem.isPending}
                        onBlur={(event) => {
                          const value = event.target.value.trim();
                          if (value !== (item.icon ?? '')) save(item, { icon: value || 'square' });
                        }}
                        className="w-24 rounded border border-slate-300 bg-white px-1.5 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                      />
                    </td>
                  )}
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      aria-label={`Sort order for ${item.name}`}
                      defaultValue={item.sortOrder}
                      disabled={updateItem.isPending}
                      onBlur={(event) => {
                        const value = Number(event.target.value);
                        if (!Number.isNaN(value) && value !== item.sortOrder) save(item, { sortOrder: value });
                      }}
                      className="w-16 rounded border border-slate-300 bg-white px-1.5 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Badge variant={item.usageCount > 0 ? 'info' : 'neutral'}>{item.usageCount}</Badge>
                  </td>
                  <td className="px-2 py-2">
                    {item.isDefault ? (
                      <Badge variant="success">Default</Badge>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={updateItem.isPending}
                        onClick={() => save(item, { isDefault: true })}
                      >
                        Make default
                      </Button>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        aria-label={`Active for ${item.name}`}
                        checked={item.isActive}
                        disabled={updateItem.isPending}
                        onChange={(event) => save(item, { isActive: event.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 accent-indigo-600 dark:border-slate-600"
                      />
                      {item.isActive ? 'Active' : 'Inactive'}
                    </label>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deleteItem.isPending}
                      onClick={() => setPendingDelete(item)}
                    >
                      {!item.isSystem && item.usageCount === 0 ? 'Delete' : 'Deactivate'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardBody>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Remove vocabulary entry"
        description={
          pendingDelete
            ? `Remove “${pendingDelete.name}”? ${
                !pendingDelete.isSystem && pendingDelete.usageCount === 0
                  ? 'It is unused, so it will be deleted permanently.'
                  : 'It is built in or in use, so it will be deactivated and hidden from pickers.'
              }`
            : ''
        }
        confirmLabel="Remove"
        loading={deleteItem.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          remove(pendingDelete);
          setPendingDelete(null);
        }}
        onClose={() => setPendingDelete(null)}
      />
    </Card>
  );
}
