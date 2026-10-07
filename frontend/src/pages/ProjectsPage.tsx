import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Pagination } from '../components/ui/Pagination';
import { Select } from '../components/ui/Select';
import { EmptyState, ErrorState, SkeletonCard } from '../components/ui/States';
import { FolderIcon } from '../components/ui/icons';
import { ProjectCard } from '../components/projects/ProjectCard';
import { ProjectForm } from '../components/projects/ProjectForm';
import { useMe } from '../features/auth/queries';
import { can } from '../features/auth/types';
import { useVocabularies } from '../features/meta/queries';
import { useProjects } from '../features/projects/queries';
import type { ProjectFilters } from '../features/projects/types';
import { useDebounce } from '../hooks/useDebounce';

const PAGE_SIZE = 12;

export function ProjectsPage() {
  const me = useMe();
  const vocab = useVocabularies();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '');
  const [createOpen, setCreateOpen] = useState(false);
  const debouncedSearch = useDebounce(searchInput, 350);
  // Tracks the q value we last wrote to the URL so we can tell our own
  // updates apart from browser back/forward navigation.
  const syncedQRef = useRef(searchParams.get('q') ?? '');

  const page = Number(searchParams.get('page') ?? '1') || 1;
  const statusKey = searchParams.get('status') ?? '';
  const includeArchived = searchParams.get('archived') === 'true';

  const filters: ProjectFilters = {
    search: debouncedSearch || undefined,
    statusKey: statusKey || undefined,
    includeArchived,
    page,
    pageSize: PAGE_SIZE,
  };

  const projects = useProjects(filters);
  const canCreate = can(me.data, 'project:create');

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next, { replace: true });
  };

  // Keep the URL in sync with the debounced search term (shareable views).
  useEffect(() => {
    const current = searchParams.get('q') ?? '';
    if (current !== debouncedSearch) {
      syncedQRef.current = debouncedSearch;
      setParam('q', debouncedSearch || null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Resync the input when the URL changes externally (back/forward, links).
  useEffect(() => {
    const urlQ = searchParams.get('q') ?? '';
    if (urlQ !== syncedQRef.current) {
      syncedQRef.current = urlQ;
      setSearchInput(urlQ);
    }
  }, [searchParams]);

  // Support "Create a new project" from the command palette (?new=1).
  useEffect(() => {
    if (canCreate && searchParams.get('new') === '1') {
      setCreateOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, canCreate]);

  const items = projects.data?.data.projects ?? [];
  const meta = projects.data?.meta ?? {};
  const totalPages = Number(meta.totalPages ?? 1);
  const total = Number(meta.total ?? items.length);
  const hasFilters = Boolean(debouncedSearch || statusKey || includeArchived);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Projects</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {total} project{total === 1 ? '' : 's'} you can access
          </p>
        </div>
        {canCreate && <Button onClick={() => setCreateOpen(true)}>New project</Button>}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="min-w-[220px] flex-1">
          <Input
            label="Search"
            placeholder="Name, code or description"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <div className="w-44">
          <Select
            label="Status"
            placeholder="All statuses"
            options={(vocab.data?.projectStatuses ?? []).map((status) => ({
              value: status.key,
              label: status.name,
            }))}
            value={statusKey}
            onChange={(event) => setParam('status', event.target.value || null)}
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => setParam('archived', event.target.checked ? 'true' : null)}
            className="h-4 w-4 rounded border-slate-300 accent-indigo-600 dark:border-slate-600"
          />
          Include archived
        </label>
        {hasFilters && (
          <Button
            variant="ghost"
            className="mb-0.5"
            onClick={() => {
              setSearchInput('');
              setSearchParams({}, { replace: true });
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {projects.isError && (
        <ErrorState
          title="Could not load projects"
          description={projects.error.message}
          onRetry={() => projects.refetch()}
        />
      )}

      {projects.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      )}

      {!projects.isLoading && !projects.isError && items.length === 0 && (
        <EmptyState
          title={hasFilters ? 'No projects match these filters' : 'No projects yet'}
          description={
            hasFilters
              ? 'Try adjusting the search or clearing the filters.'
              : canCreate
                ? 'Create the first project to start tracking development work.'
                : 'You are not a member of any project yet. Ask a project manager to add you.'
          }
          action={canCreate && !hasFilters ? <Button onClick={() => setCreateOpen(true)}>New project</Button> : undefined}
        />
      )}

      {items.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={(next) => setParam('page', String(next))}
          />
        </>
      )}

      {!canCreate && !projects.isLoading && (
        <Alert variant="info" className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5">
            <FolderIcon className="text-sm" />
            Viewers and developers can browse the projects they belong to. Creating projects requires the
            project-manager or admin role.
          </span>
        </Alert>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New project"
        description="Projects group tasks, milestones and team members."
        size="lg"
      >
        <ProjectForm onSuccess={() => setCreateOpen(false)} onCancel={() => setCreateOpen(false)} />
      </Modal>
    </div>
  );
}
