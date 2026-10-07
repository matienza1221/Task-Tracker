import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminImportPage } from './AdminImportPage';
import type { ImportPreviewResult, ImportUploadResult } from '../features/imports/types';

vi.mock('../features/imports/api', () => ({
  uploadImportFile: vi.fn(),
  previewImportJob: vi.fn(),
  commitImportJob: vi.fn(),
  fetchImportJob: vi.fn(),
  fetchImportJobs: vi.fn(),
}));

vi.mock('../features/imports/template', () => ({
  downloadImportTemplate: vi.fn(),
}));

vi.mock('../features/projects/queries', () => ({
  useProjects: () => ({
    data: {
      data: {
        projects: [
          {
            id: 'p1',
            code: 'WEBAPP',
            name: 'Web App',
            description: null,
            status: { id: 's1', key: 'ACTIVE', name: 'Active', category: 'ACTIVE', color: '#22c55e' },
            priority: { id: 'pr1', key: 'MEDIUM', name: 'Medium', weight: 2, color: '#eab308' },
            startDate: null,
            targetDate: null,
            actualCompletionDate: null,
            manager: null,
            createdBy: null,
            progress: 0,
            progressWeighting: 'COUNT',
            isArchived: false,
            archivedAt: null,
            myRole: 'ADMIN',
            memberCount: 1,
            milestoneCount: 0,
            labelCount: 0,
            createdAt: '',
            updatedAt: '',
          },
        ],
      },
      meta: { total: 1 },
    },
  }),
  useMembers: () => ({
    data: {
      members: [
        {
          userId: 'u1',
          displayName: 'Dev Person',
          email: 'dev@example.com',
          avatarUrl: null,
          globalRole: 'DEVELOPER',
          projectRole: 'DEVELOPER',
          isProjectManager: false,
          addedBy: null,
          createdAt: '',
        },
      ],
    },
  }),
}));

const { uploadImportFile, previewImportJob, commitImportJob, fetchImportJobs } = await import('../features/imports/api');
const { downloadImportTemplate } = await import('../features/imports/template');
const mockedUpload = vi.mocked(uploadImportFile);
const mockedPreview = vi.mocked(previewImportJob);
const mockedCommit = vi.mocked(commitImportJob);
const mockedJobs = vi.mocked(fetchImportJobs);
const mockedDownloadTemplate = vi.mocked(downloadImportTemplate);

const UPLOAD: ImportUploadResult = {
  job: { id: 'job1', filename: 'tracker.csv', sourceFormat: 'CSV', status: 'UPLOADED', projectId: null, mapping: null, summary: null, createdAt: '', committedAt: null },
  headers: ['Area', 'Task', 'Owner', 'Priority', 'Status', 'Due date', 'Completed date', 'Blocker / next step', 'Reference link'],
  sampleRows: [['Meetings', 'Add summary card', '', 'Medium', 'Done', '', '', 'Verified', 'Universe.jsx:68']],
  rowCount: 31,
  headerRowNumber: 9,
  preambleRows: 8,
};

const PREVIEW: ImportPreviewResult = {
  summary: { headers: UPLOAD.headers, rowCount: 31, valid: 30, invalid: 1, duplicates: 0, labelsToCreate: ['Meetings'] },
  preview: [
    {
      rowNumber: 2,
      status: 'VALID',
      errors: [],
      normalized: { title: 'Add summary card', statusId: 's1', priorityId: 'p1' },
      raw: { Task: 'Add summary card' },
    },
  ],
  errors: [
    { rowNumber: 9, status: 'INVALID', errors: [{ path: 'status', message: 'Unknown status “Wonky”.' }], normalized: null, raw: { Task: 'Broken row' } },
  ],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin/import']}>
        <AdminImportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AdminImportPage', () => {
  beforeEach(() => {
    mockedUpload.mockReset();
    mockedPreview.mockReset();
    mockedCommit.mockReset();
    mockedJobs.mockReset();
    mockedDownloadTemplate.mockReset();
    mockedJobs.mockResolvedValue({ data: { imports: [] }, meta: { total: 0, page: 1, pageSize: 10 } });
  });

  it('offers a downloadable CSV template on the upload step', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Download template' }));
    expect(mockedDownloadTemplate).toHaveBeenCalledTimes(1);
  });

  it('walks through upload → mapping with suggested columns', async () => {
    const user = userEvent.setup();
    mockedUpload.mockResolvedValue(UPLOAD);
    renderPage();

    await user.upload(screen.getByLabelText(/Choose a CSV\/XLSX file/), new File(['Area,Task'], 'tracker.csv', { type: 'text/csv' }));

    await waitFor(() => expect(mockedUpload).toHaveBeenCalled());
    expect(await screen.findByText(/31 row\(s\)/)).toBeInTheDocument();
    // The reference headers are auto-mapped.
    expect(screen.getByLabelText('Column for Task title')).toHaveValue('Task');
    expect(screen.getByLabelText('Column for Area / label')).toHaveValue('Area');
    expect(screen.getByLabelText('Column for Assignee')).toHaveValue('Owner');
  });

  it('validates rows and shows the preview summary with errors', async () => {
    const user = userEvent.setup();
    mockedUpload.mockResolvedValue(UPLOAD);
    mockedPreview.mockResolvedValue(PREVIEW);
    renderPage();

    await user.upload(screen.getByLabelText(/Choose a CSV\/XLSX file/), new File(['x'], 'tracker.csv', { type: 'text/csv' }));
    await screen.findByText(/31 row\(s\)/);

    await user.selectOptions(screen.getByLabelText('Target project'), 'p1');
    await user.click(screen.getByRole('button', { name: 'Validate rows' }));

    await waitFor(() => expect(mockedPreview).toHaveBeenCalled());
    const [, input] = mockedPreview.mock.calls[0];
    expect(input.projectId).toBe('p1');
    expect(input.mapping.title).toBe('Task');
    expect(input.skipDuplicates).toBe(true);

    expect(await screen.findByText('30 ready')).toBeInTheDocument();
    expect(screen.getByText('1 invalid')).toBeInTheDocument();
    expect(screen.getByText(/Labels to create: Meetings/)).toBeInTheDocument();
    expect(screen.getByText(/Row 9: status — Unknown status/)).toBeInTheDocument();
  });

  it('commits and reports the result', async () => {
    const user = userEvent.setup();
    mockedUpload.mockResolvedValue(UPLOAD);
    mockedPreview.mockResolvedValue(PREVIEW);
    mockedCommit.mockResolvedValue({
      alreadyCommitted: false,
      summary: { ...PREVIEW.summary, imported: 30, skipped: 0, labelsCreated: 1, taskKeys: ['WEBAPP-1', 'WEBAPP-2'] },
    });
    renderPage();

    await user.upload(screen.getByLabelText(/Choose a CSV\/XLSX file/), new File(['x'], 'tracker.csv', { type: 'text/csv' }));
    await screen.findByText(/31 row\(s\)/);
    await user.selectOptions(screen.getByLabelText('Target project'), 'p1');
    await user.click(screen.getByRole('button', { name: 'Validate rows' }));
    await screen.findByText('30 ready');

    await user.click(screen.getByRole('button', { name: 'Import 30 task(s)' }));

    await waitFor(() => expect(mockedCommit).toHaveBeenCalled());
    expect(await screen.findByText('30 task(s) imported')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the project' })).toHaveAttribute('href', '/projects/p1');
  });

  it('requires a project and a title mapping before validating', async () => {
    const user = userEvent.setup();
    mockedUpload.mockResolvedValue({ ...UPLOAD, headers: ['Column 1'], sampleRows: [['x']] });
    renderPage();

    await user.upload(screen.getByLabelText(/Choose a CSV\/XLSX file/), new File(['x'], 'tracker.csv', { type: 'text/csv' }));
    await screen.findByText(/31 row\(s\)/);

    const validate = screen.getByRole('button', { name: 'Validate rows' });
    expect(validate).toBeDisabled();
    expect(within(screen.getByRole('table')).getAllByText('Not mapped').length).toBeGreaterThan(0);
  });
});
