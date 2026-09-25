import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectsPage } from './ProjectsPage';
import { fetchMe } from '../features/auth/api';
import type { AuthUser, GlobalRole } from '../features/auth/types';
import type { Project } from '../features/projects/types';

vi.mock('../features/auth/api', () => ({
  fetchMe: vi.fn(),
  loginRequest: vi.fn(),
  logoutRequest: vi.fn(),
  changePasswordRequest: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPasswordRequest: vi.fn(),
}));

vi.mock('../features/projects/api', () => ({
  fetchProjects: vi.fn(),
  fetchProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  archiveProject: vi.fn(),
  unarchiveProject: vi.fn(),
  deleteProject: vi.fn(),
  fetchMembers: vi.fn(),
  addMember: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
  fetchMilestones: vi.fn(),
  createMilestone: vi.fn(),
  updateMilestone: vi.fn(),
  deleteMilestone: vi.fn(),
  fetchLabels: vi.fn(),
  createLabel: vi.fn(),
  updateLabel: vi.fn(),
  deleteLabel: vi.fn(),
  fetchSavedViews: vi.fn(),
  createSavedView: vi.fn(),
  deleteSavedView: vi.fn(),
  fetchActivity: vi.fn(),
}));

vi.mock('../features/meta/queries', () => ({
  useVocabularies: () => ({
    data: {
      projectStatuses: [
        { id: 's1', key: 'ACTIVE', name: 'Active', color: '#22c55e', isDefault: false, category: 'ACTIVE' },
      ],
      taskStatuses: [],
      taskPriorities: [{ id: 'p1', key: 'HIGH', name: 'High', color: '#f97316', isDefault: false, weight: 3 }],
      taskTypes: [],
    },
    isLoading: false,
  }),
}));

const { fetchProjects } = await import('../features/projects/api');
const mockedFetchProjects = vi.mocked(fetchProjects);

function makeUser(globalRole: GlobalRole, permissions: string[]): AuthUser {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'user@example.com',
    displayName: 'Test User',
    avatarUrl: null,
    globalRole,
    timezone: 'Asia/Manila',
    mustChangePassword: false,
    lastLoginAt: null,
    permissions,
  };
}

const PROJECT: Project = {
  id: '22222222-2222-2222-2222-222222222222',
  code: 'WEBAPP',
  name: 'Customer Portal',
  description: 'Rewrite of the monitoring portal',
  status: { id: 's1', key: 'ACTIVE', name: 'Active', category: 'ACTIVE', color: '#22c55e' },
  priority: { id: 'p1', key: 'HIGH', name: 'High', weight: 3, color: '#f97316' },
  startDate: '2026-01-01',
  targetDate: '2026-06-30',
  actualCompletionDate: null,
  manager: { id: 'u2', displayName: 'Project Manager', email: 'pm@example.com', avatarUrl: null },
  createdBy: { id: 'u2', displayName: 'Project Manager' },
  progress: 42.5,
  progressWeighting: 'COUNT',
  isArchived: false,
  archivedAt: null,
  myRole: 'MANAGER',
  memberCount: 3,
  milestoneCount: 2,
  labelCount: 4,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/projects']}>
        <ProjectsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProjectsPage', () => {
  beforeEach(() => {
    mockedFetchProjects.mockReset();
    mockedFetchProjects.mockResolvedValue({
      data: { projects: [PROJECT] },
      meta: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
    });
  });

  it('lists accessible projects with status and progress', async () => {
    vi.mocked(fetchMe).mockResolvedValue({ user: makeUser('DEVELOPER', ['project:view']) });
    renderPage();

    expect(await screen.findByText('Customer Portal')).toBeInTheDocument();
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '43');
    expect(screen.getByText('1 project you can access')).toBeInTheDocument();
  });

  it('shows the create action only for users who may create projects', async () => {
    vi.mocked(fetchMe).mockResolvedValue({ user: makeUser('PROJECT_MANAGER', ['project:view', 'project:create']) });
    renderPage();

    expect(await screen.findByRole('button', { name: 'New project' })).toBeInTheDocument();
  });

  it('hides the create action from developers without the permission', async () => {
    vi.mocked(fetchMe).mockResolvedValue({ user: makeUser('DEVELOPER', ['project:view']) });
    renderPage();

    await screen.findByText('Customer Portal');
    expect(screen.queryByRole('button', { name: 'New project' })).not.toBeInTheDocument();
  });

  it('renders an empty state when no projects match', async () => {
    vi.mocked(fetchMe).mockResolvedValue({ user: makeUser('DEVELOPER', ['project:view']) });
    mockedFetchProjects.mockResolvedValue({
      data: { projects: [] },
      meta: { page: 1, pageSize: 12, total: 0, totalPages: 1 },
    });
    renderPage();

    expect(await screen.findByText('No projects yet')).toBeInTheDocument();
  });

  it('surfaces a retryable error state', async () => {
    vi.mocked(fetchMe).mockResolvedValue({ user: makeUser('DEVELOPER', ['project:view']) });
    mockedFetchProjects.mockRejectedValue(new Error('Network down'));
    renderPage();

    expect(await screen.findByText('Could not load projects')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('opens the create dialog with the project form', async () => {
    vi.mocked(fetchMe).mockResolvedValue({ user: makeUser('ADMIN', ['project:view', 'project:create']) });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'New project' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Project code')).toBeInTheDocument();
    expect(screen.getByLabelText('Project name')).toBeInTheDocument();
  });
});
