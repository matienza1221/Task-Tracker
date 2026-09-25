import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ProjectForm } from './ProjectForm';

vi.mock('../../features/projects/api', () => ({
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

vi.mock('../../features/meta/queries', () => ({
  useVocabularies: () => ({
    data: {
      projectStatuses: [{ id: 's1', key: 'PLANNING', name: 'Planning', color: '#8b5cf6', isDefault: true, category: 'PLANNING' }],
      taskStatuses: [],
      taskPriorities: [{ id: 'p1', key: 'MEDIUM', name: 'Medium', color: '#eab308', isDefault: true, weight: 2 }],
      taskTypes: [],
    },
    isLoading: false,
  }),
}));

const { createProject } = await import('../../features/projects/api');
const mockedCreateProject = vi.mocked(createProject);

function renderForm(onSuccess = vi.fn(), onCancel = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProjectForm onSuccess={onSuccess} onCancel={onCancel} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { onSuccess, onCancel };
}

describe('ProjectForm', () => {
  it('shows validation errors for missing required fields', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(await screen.findByText('Project name is required.')).toBeInTheDocument();
    expect(mockedCreateProject).not.toHaveBeenCalled();
  });

  it('validates the project code format', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText('Project code'), '123');
    await user.type(screen.getByLabelText('Project name'), 'Valid name');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(await screen.findByText(/Code must start with a letter/)).toBeInTheDocument();
    expect(mockedCreateProject).not.toHaveBeenCalled();
  });

  it('submits a valid project and reports success', async () => {
    const user = userEvent.setup();
    const { onSuccess } = renderForm();
    mockedCreateProject.mockResolvedValue({
      project: {
        id: 'p1',
        code: 'TEST',
        name: 'Test Project',
        description: null,
        status: { id: 's1', key: 'PLANNING', name: 'Planning', category: 'PLANNING', color: '#8b5cf6' },
        priority: { id: 'p1', key: 'MEDIUM', name: 'Medium', weight: 2, color: '#eab308' },
        startDate: null,
        targetDate: null,
        actualCompletionDate: null,
        manager: null,
        createdBy: null,
        progress: 0,
        progressWeighting: 'COUNT',
        isArchived: false,
        archivedAt: null,
        myRole: 'MANAGER',
        memberCount: 1,
        milestoneCount: 0,
        labelCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    await user.type(screen.getByLabelText('Project code'), 'test');
    await user.type(screen.getByLabelText('Project name'), 'Test Project');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => expect(mockedCreateProject).toHaveBeenCalledTimes(1));
    const payload = mockedCreateProject.mock.calls[0][0];
    expect(payload.code).toBe('TEST');
    expect(payload.name).toBe('Test Project');
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('shows a server error when the code is already taken', async () => {
    const user = userEvent.setup();
    renderForm();
    mockedCreateProject.mockRejectedValue(
      Object.assign(new Error('A project with this code already exists.'), {
        name: 'ApiError',
        status: 409,
        code: 'CONFLICT',
        details: [],
      }),
    );

    await user.type(screen.getByLabelText('Project code'), 'DUPE');
    await user.type(screen.getByLabelText('Project name'), 'Duplicate Project');
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
  });
});
