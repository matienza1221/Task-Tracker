import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttachmentsSection } from './AttachmentsSection';
import type { AttachmentDto } from '../../features/attachments/types';

vi.mock('../../features/attachments/api', () => ({
  fetchAttachments: vi.fn(),
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
  attachmentDownloadUrl: (id: string) => `/api/attachments/${id}/download`,
}));

const { fetchAttachments, uploadAttachment, deleteAttachment } = await import('../../features/attachments/api');
const mockedFetch = vi.mocked(fetchAttachments);
const mockedUpload = vi.mocked(uploadAttachment);
const mockedDelete = vi.mocked(deleteAttachment);

function makeAttachment(overrides: Partial<AttachmentDto> = {}): AttachmentDto {
  return {
    id: 'a1',
    taskId: 't1',
    projectId: 'p1',
    filename: 'spec.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2048,
    checksumSha256: 'a'.repeat(64),
    uploadedBy: { id: 'u1', displayName: 'Admin User', avatarUrl: null },
    isOwner: true,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderSection(options: { canUpload?: boolean; canModerate?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AttachmentsSection
          taskId="t1"
          canUpload={options.canUpload ?? true}
          canModerate={options.canModerate ?? false}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AttachmentsSection', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedUpload.mockReset();
    mockedDelete.mockReset();
    mockedFetch.mockResolvedValue({ data: { attachments: [makeAttachment()] }, meta: { total: 1, page: 1, pageSize: 50 } });
  });

  it('lists attachments with size, uploader and a download link', async () => {
    renderSection();

    expect(await screen.findByText('spec.pdf')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    expect(screen.getByText('Admin User')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'spec.pdf' })).toHaveAttribute('href', '/api/attachments/a1/download');
    expect(screen.getByText('1 file')).toBeInTheDocument();
  });

  it('rejects disallowed extensions before uploading', async () => {
    const user = userEvent.setup();
    renderSection();
    await screen.findByText('spec.pdf');

    const input = screen.getByLabelText('Choose a file to upload');
    const file = new File(['alert(1)'], 'script.exe', { type: 'application/octet-stream' });
    await user.upload(input, file);

    await waitFor(() => expect(mockedUpload).not.toHaveBeenCalled());
  });

  it('rejects files above the size limit', async () => {
    const user = userEvent.setup();
    renderSection();
    await screen.findByText('spec.pdf');

    const input = screen.getByLabelText('Choose a file to upload');
    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' });
    await user.upload(input, big);

    await waitFor(() => expect(mockedUpload).not.toHaveBeenCalled());
  });

  it('uploads an allowed file', async () => {
    const user = userEvent.setup();
    mockedUpload.mockResolvedValue({ attachment: makeAttachment({ id: 'a2', filename: 'notes.txt' }) });
    renderSection();
    await screen.findByText('spec.pdf');

    const input = screen.getByLabelText('Choose a file to upload');
    await user.upload(input, new File(['notes'], 'notes.txt', { type: 'text/plain' }));

    await waitFor(() => expect(mockedUpload).toHaveBeenCalledTimes(1));
    expect(mockedUpload.mock.calls[0][0]).toBe('t1');
  });

  it('deletes owned attachments after confirmation', async () => {
    const user = userEvent.setup();
    mockedDelete.mockResolvedValue(null);
    renderSection();
    await screen.findByText('spec.pdf');

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete file' }));

    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('a1'));
  });

  it('hides upload for roles without permission and hides delete for non-owners', async () => {
    mockedFetch.mockResolvedValue({
      data: { attachments: [makeAttachment({ isOwner: false })] },
      meta: { total: 1, page: 1, pageSize: 50 },
    });
    renderSection({ canUpload: false, canModerate: false });

    await screen.findByText('spec.pdf');
    expect(screen.queryByRole('button', { name: /Upload/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });
});
