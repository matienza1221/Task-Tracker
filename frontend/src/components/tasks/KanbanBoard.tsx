import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { BoardCard } from './BoardCard';
import { findTask, resolveDropTarget } from '../../features/tasks/board';
import { useMoveTask } from '../../features/tasks/queries';
import type { BoardColumn, Task } from '../../features/tasks/types';
import { asApiError } from '../../lib/api/errors';
import { cn } from '../../lib/cn';
import { toast } from '../../stores/toastStore';
import { PlusIcon } from '../ui/plus-icon';
import { MenuIcon } from '../ui/icons';

interface StatusOption {
  id: string;
  name: string;
}

function SortableCard({
  task,
  canMove,
  statuses,
  onMove,
}: {
  task: Task;
  canMove: boolean;
  statuses: StatusOption[];
  onMove: (task: Task, statusId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !canMove,
  });

  const dragHandle = canMove ? (
    <button
      type="button"
      {...attributes}
      {...listeners}
      aria-label={`Drag ${task.displayKey} to another column`}
      className="cursor-grab rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing dark:hover:bg-slate-700 dark:hover:text-slate-200"
    >
      <MenuIcon className="text-sm" />
    </button>
  ) : undefined;

  const moveControl = canMove ? (
    <label className="mt-2.5 flex items-center gap-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
      <span className="shrink-0">Move to</span>
      <select
        value={task.status.id}
        onChange={(event) => onMove(task, event.target.value)}
        aria-label={`Move ${task.displayKey} to another column`}
        className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 py-1 text-[11px] text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
      >
        {statuses.map((status) => (
          <option key={status.id} value={status.id}>
            {status.name}
          </option>
        ))}
      </select>
    </label>
  ) : undefined;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('touch-manipulation', isDragging && 'opacity-40')}
    >
      <BoardCard task={task} dragHandle={dragHandle} moveControl={moveControl} />
    </div>
  );
}

function Column({
  column,
  canMove,
  statuses,
  onMove,
  onCreateTask,
}: {
  column: BoardColumn;
  canMove: boolean;
  statuses: StatusOption[];
  onMove: (task: Task, statusId: string) => void;
  onCreateTask?: (statusId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.status.id}` });

  return (
    <section
      ref={setNodeRef}
      aria-label={`${column.status.name} column, ${column.tasks.length} task${column.tasks.length === 1 ? '' : 's'}`}
      className={cn(
        'flex w-72 shrink-0 flex-col rounded-xl border border-slate-200 bg-slate-100/70 dark:border-slate-800 dark:bg-slate-900/60',
        isOver && 'border-indigo-400 bg-indigo-50/60 dark:border-indigo-600 dark:bg-indigo-950/30',
      )}
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span className="inline-flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: column.status.color }} />
          <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{column.status.name}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <Badge variant="neutral">{column.tasks.length}</Badge>
          {onCreateTask && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Add task to ${column.status.name}`}
              onClick={() => onCreateTask(column.status.id)}
            >
              <PlusIcon className="text-sm" />
            </Button>
          )}
        </span>
      </header>

      <SortableContext items={column.tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className="flex max-h-[65vh] min-h-[80px] flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3 scrollbar-thin">
          {column.tasks.map((task) => (
            <SortableCard key={task.id} task={task} canMove={canMove} statuses={statuses} onMove={onMove} />
          ))}
          {column.tasks.length === 0 && (
            <p className="px-2 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
              {canMove ? 'Drop tasks here' : 'No tasks'}
            </p>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

export interface KanbanBoardProps {
  projectId: string;
  columns: BoardColumn[];
  canMove: boolean;
  onCreateTask?: (statusId: string) => void;
}

/**
 * Kanban board with mouse, touch and keyboard drag & drop plus a non-drag
 * "Move to" control on every card. Moves are applied optimistically and rolled
 * back if the server rejects them (including 409 conflicts).
 */
export function KanbanBoard({ projectId, columns, canMove, onCreateTask }: KanbanBoardProps) {
  const move = useMoveTask(projectId);
  const [activeTask, setActiveTask] = useState<Task | undefined>(undefined);

  const statuses: StatusOption[] = columns.map((column) => ({ id: column.status.id, name: column.status.name }));

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const handleMoveError = (error: Error) => {
    const apiError = asApiError(error);
    if (apiError.status === 409) {
      toast.error('Task changed elsewhere', 'The board was refreshed with the latest version.');
    } else if (apiError.status === 403 || apiError.status === 404) {
      toast.error('Move not allowed', 'You do not have permission to move this task.');
    } else {
      toast.error('Could not move task', apiError.message);
    }
  };

  const onDragStart = (event: DragStartEvent) => {
    setActiveTask(findTask(columns, String(event.active.id)));
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveTask(undefined);
    const { active, over } = event;
    if (!over) return;

    const task = findTask(columns, String(active.id));
    const target = resolveDropTarget(columns, String(active.id), String(over.id));
    if (!task || !target) return;

    if (task.status.id === target.statusId) {
      const currentIndex = columns
        .find((column) => column.status.id === target.statusId)!
        .tasks.findIndex((item) => item.id === task.id);
      if (currentIndex === target.targetIndex) return;
    }

    move.mutate(
      { taskId: task.id, statusId: target.statusId, targetIndex: target.targetIndex, version: task.version },
      { onError: handleMoveError },
    );
  };

  const moveToColumn = (task: Task, statusId: string) => {
    if (task.status.id === statusId) return;
    const target = columns.find((column) => column.status.id === statusId);
    if (!target) return;
    move.mutate(
      { taskId: task.id, statusId, targetIndex: target.tasks.length, version: task.version },
      { onError: handleMoveError },
    );
  };

  const taskLabel = (id: string | number) => {
    const task = findTask(columns, String(id));
    return task ? `${task.displayKey} ${task.title}` : String(id);
  };
  const overLabel = (id: string | number) => {
    const value = String(id);
    if (value.startsWith('column:')) {
      const statusId = value.slice('column:'.length);
      return columns.find((column) => column.status.id === statusId)?.status.name ?? 'a column';
    }
    return taskLabel(value);
  };
  const announcements = {
    onDragStart: ({ active }: { active: { id: string | number } }) => `Picked up ${taskLabel(active.id)}.`,
    onDragOver: ({ over }: { over: { id: string | number } | null }) =>
      over ? `Over ${overLabel(over.id)}.` : 'Not over a column.',
    onDragEnd: ({ over }: { over: { id: string | number } | null }) =>
      over ? `Dropped on ${overLabel(over.id)}.` : 'Move cancelled.',
    onDragCancel: () => 'Move cancelled.',
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      accessibility={{ announcements }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveTask(undefined)}
    >
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
        {columns.map((column) => (
          <Column
            key={column.status.id}
            column={column}
            canMove={canMove}
            statuses={statuses}
            onMove={moveToColumn}
            onCreateTask={onCreateTask}
          />
        ))}
      </div>
      <DragOverlay>{activeTask ? <BoardCard task={activeTask} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}
