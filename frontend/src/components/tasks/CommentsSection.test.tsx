import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommentsSection } from './CommentsSection';
import { fetchMe } from '../../features/auth/api';
import type { Comment } from '../../features/comments/types';

vi.mock('../../features/auth/api', () => ({
  fetchMe: vi.fn(),
  loginRequest: vi.fn(),
  logoutRequest: vi.fn(),
  changePasswordRequest: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPasswordRequest: vi.fn(),
}));

vi.mock('../../features/comments/api', () => ({
  fetchComments: vi.fn(),
  createComment: vi.fn(),
  updateComment: vi.fn(),
  deleteComment: vi.fn(),
}));

vi.mock('../../features/projects/queries', () => ({
  useMembers: () => ({
    data: {
      members: [
        {
          userId: 'u2',
          displayName: 'Marvin Reyes',
          email: 'marvin@example.com',
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

const { fetchComments, createComment, deleteComment } = await import('../../features/comments/api');
const mockedFetchComments = vi.mocked(fetchComments);
const mockedCreateComment = vi.mocked(createComment);
const mockedDeleteComment = vi.mocked(deleteComment);

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1',
    body: 'Setup Vite is done',
    author: { id: 'u1', displayName: 'Admin User', avatarUrl: null },
    mentions: [],
    editedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderSection(options: { canComment?: boolean; canModerate?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CommentsSection
          taskId="t1"
          projectId="p1"
          canComment={options.canComment ?? true}
          canModerate={options.canModerate ?? false}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CommentsSection', () => {
  beforeEach(() => {
    vi.mocked(fetchMe).mockResolvedValue({
      user: {
        id: 'u1',
        email: 'admin@example.com',
        displayName: 'Admin User',
        avatarUrl: null,
        globalRole: 'ADMIN',
        timezone: 'Asia/Manila',
        mustChangePassword: false,
        lastLoginAt: null,
        permissions: ['comment:create', 'comment:moderate'],
      },
    });
    mockedFetchComments.mockReset();
    mockedCreateComment.mockReset();
    mockedDeleteComment.mockReset();
  });

  it('renders comments with author and mention highlighting', async () => {
    mockedFetchComments.mockResolvedValue({
      data: {
        comments: [
          makeComment({
            body: 'Thanks @Marvin Reyes for the review',
            mentions: [{ id: 'u2', displayName: 'Marvin Reyes' }],
          }),
        ],
      },
      meta: { total: 1, page: 1, pageSize: 50 },
    });

    renderSection();

    expect(await screen.findByText(/Thanks/)).toBeInTheDocument();
    expect(screen.getByText('@Marvin Reyes')).toBeInTheDocument();
    expect(screen.getByText('Admin User')).toBeInTheDocument();
    expect(screen.getByText('1 comment')).toBeInTheDocument();
  });

  it('adds a comment and sends explicit mention ids', async () => {
    mockedFetchComments.mockResolvedValue({ data: { comments: [] }, meta: { total: 0, page: 1, pageSize: 50 } });
    mockedCreateComment.mockResolvedValue({ comment: makeComment() });

    const user = userEvent.setup();
    renderSection();

    await screen.findByText('No comments yet');
    const textarea = screen.getByLabelText('Add a comment');
    await user.type(textarea, 'Ping @Mar');
    await user.click(await screen.findByRole('option', { name: /Marvin Reyes/ }));
    await user.type(textarea, 'can you review?');
    await user.click(screen.getByRole('button', { name: 'Comment' }));

    await waitFor(() => expect(mockedCreateComment).toHaveBeenCalledTimes(1));
    const [taskId, payload] = mockedCreateComment.mock.calls[0];
    expect(taskId).toBe('t1');
    expect(payload.body).toContain('@Marvin Reyes');
    expect(payload.mentionedUserIds).toEqual(['u2']);
  });

  it('shows edit and delete only for the author or moderators', async () => {
    mockedFetchComments.mockResolvedValue({
      data: {
        comments: [makeComment({ id: 'c1' }), makeComment({ id: 'c2', body: 'Someone else', author: { id: 'u9', displayName: 'Other Dev', avatarUrl: null } })],
      },
      meta: { total: 2, page: 1, pageSize: 50 },
    });

    renderSection({ canModerate: false });

    await screen.findByText('Setup Vite is done');
    // Only the author's comment exposes Edit; Delete is shown for both because the
    // viewer is an admin holding comment:moderate through the API — here canModerate=false
    // so it is limited to the author's own comment.
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
  });

  it('hides the composer when the role cannot comment', async () => {
    mockedFetchComments.mockResolvedValue({ data: { comments: [] }, meta: { total: 0, page: 1, pageSize: 50 } });
    renderSection({ canComment: false });

    await screen.findByText('No comments yet');
    expect(screen.queryByLabelText('Add a comment')).not.toBeInTheDocument();
    expect(screen.getByText(/Your role can read comments/)).toBeInTheDocument();
  });

  it('deletes a comment after confirmation', async () => {
    mockedFetchComments.mockResolvedValue({
      data: { comments: [makeComment()] },
      meta: { total: 1, page: 1, pageSize: 50 },
    });
    mockedDeleteComment.mockResolvedValue(null);

    const user = userEvent.setup();
    renderSection();

    await screen.findByText('Setup Vite is done');
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Delete comment' }));

    await waitFor(() => expect(mockedDeleteComment).toHaveBeenCalledWith('c1'));
  });
});
