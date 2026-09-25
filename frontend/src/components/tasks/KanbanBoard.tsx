import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
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

const ANNOUNCEMENTS = {
  onDragStart: ({ active }: { active: { id: string | number } }) => `Picked up task ${active.id}.`,
  onDragOver: ({ over }: { over: { id: string | number } | null }) => (over ? `Task is over ${over.id}.` : 'Task is no longer over a column.'),
  onDragEnd: ({ over }: { over: { id: string | number } | null }) => (over ? `Task dropped on ${over.id}.` : 'Task dropped.'),
  onDragCancel: () => 'Move cancelled.',
};

function SortableCard({ task, canMove }: { task: Task; canMove: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !canMove,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('touch-none', isDragging && 'opacity-40', canMove && 'cursor-grab active:cursor-grabbing')}
      {...attributes}
      {...listeners}
    >
      <BoardCard task={task} />
    </div>
  );
}

function Column({
  column,
  canMove,
  onCreateTask,
}: {
  column: BoardColumn;
  canMove: boolean;
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
          {onCreateTask && canMove && (
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
            <SortableCard key={task.id} task={task} canMove={canMove} />
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
 * Kanban board with pointer and keyboard drag & drop. The move is applied
 * optimistically and rolled back if the server rejects it (including 409
 * conflicts when someone else edited the task in the meantime).
 */
export function KanbanBoard({ projectId, columns, canMove, onCreateTask }: KanbanBoardProps) {
  const move = useMoveTask(projectId);
  const [activeTask, setActiveTask] = useState<Task | undefined>(undefined);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

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
      {
        onSuccess: (result) => toast.success(`Task ${result.task.displayKey} moved to ${result.task.status.name}`),
        onError: (error) => {
          const apiError = asApiError(error);
          if (apiError.status === 409) {
            toast.error('Task changed elsewhere', 'The board was refreshed with the latest version.');
          } else if (apiError.status === 403 || apiError.status === 404) {
            toast.error('Move not allowed', 'You do not have permission to move this task.');
          } else {
            toast.error('Could not move task', apiError.message);
          }
        },
      },
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      accessibility={{ announcements: ANNOUNCEMENTS }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveTask(undefined)}
    >
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-thin">
        {columns.map((column) => (
          <Column key={column.status.id} column={column} canMove={canMove} onCreateTask={onCreateTask} />
        ))}
      </div>
      <DragOverlay>{activeTask ? <BoardCard task={activeTask} overlay /> : null}</DragOverlay>
    </DndContext>
  );
}
