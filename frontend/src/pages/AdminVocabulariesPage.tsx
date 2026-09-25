import { Alert } from '../components/ui/Alert';
import { Card, CardBody } from '../components/ui/Card';
import { ErrorState, Skeleton } from '../components/ui/States';
import { SettingsIcon } from '../components/ui/icons';
import { VocabularySection } from '../components/admin/VocabularySection';
import { useVocabularyCatalog } from '../features/vocabularies/queries';

const CATEGORY_LABELS: Record<string, string> = {
  BACKLOG: 'Backlog',
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  REVIEW: 'Review',
  TESTING: 'Testing',
  BLOCKED: 'Blocked',
  DONE: 'Done (completes work)',
  CANCELLED: 'Cancelled (excluded from progress)',
  PLANNING: 'Planning',
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

const toOptions = (values: string[]) => values.map((value) => ({ value, label: CATEGORY_LABELS[value] ?? value }));

export function AdminVocabulariesPage() {
  const catalog = useVocabularyCatalog();

  if (catalog.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (catalog.isError || !catalog.data) {
    return (
      <ErrorState
        title="Could not load vocabularies"
        description={catalog.error?.message}
        onRetry={() => catalog.refetch()}
      />
    );
  }

  const data = catalog.data;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900 dark:text-white">
          <SettingsIcon className="text-lg text-indigo-500" />
          Vocabularies
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Statuses, priorities and types drive the whole workflow. Categories control progress maths and overdue rules,
          so they are chosen from a fixed list.
        </p>
      </div>

      <Alert variant="info">
        Deactivating an entry hides it from pickers but keeps existing tasks valid. Entries that are in use cannot be
        deleted; deactivate them instead. A default entry is used when newly created items do not specify one.
      </Alert>

      <VocabularySection
        kind="task-statuses"
        title="Task statuses"
        description="Columns on the board and values in the status picker."
        items={data.taskStatuses}
        categoryOptions={toOptions(data.categories.taskStatuses)}
      />

      <VocabularySection
        kind="task-priorities"
        title="Priorities"
        description="Higher weight sorts first when ordering by priority."
        items={data.taskPriorities}
        showWeight
      />

      <VocabularySection
        kind="task-types"
        title="Task types"
        description="Feature, Bug, Improvement and the rest of the work categories."
        items={data.taskTypes}
        showIcon
      />

      <VocabularySection
        kind="project-statuses"
        title="Project statuses"
        description="Completing a project stamps its completion date automatically."
        items={data.projectStatuses}
        categoryOptions={toOptions(data.categories.projectStatuses)}
      />

      <Card>
        <CardBody className="text-xs text-slate-500 dark:text-slate-400">
          Every change here is recorded in the audit log with the administrator who made it. Existing tasks keep working
          when a status is renamed — keys never change.
        </CardBody>
      </Card>
    </div>
  );
}
