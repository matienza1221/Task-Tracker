import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, ErrorState, Skeleton } from '../ui/States';
import { Textarea } from '../ui/Textarea';
import { useMe } from '../../features/auth/queries';
import { useMembers } from '../../features/projects/queries';
import { useComments, useCreateComment, useDeleteComment, useUpdateComment } from '../../features/comments/queries';
import { applyMention, filterMentionSuggestions, findMentionQuery, splitByMentions } from '../../features/comments/mentions';
import type { Comment } from '../../features/comments/types';
import { formatDateTime, formatRelative } from '../../lib/format';
import { toast } from '../../stores/toastStore';
import { cn } from '../../lib/cn';

function CommentBody({ comment }: { comment: Comment }) {
  const segments = useMemo(
    () => splitByMentions(comment.body, comment.mentions.map((mention) => mention.displayName)),
    [comment.body, comment.mentions],
  );
  return (
    <p className="text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-200">
      {segments.map((segment, index) =>
        segment.type === 'mention' ? (
          <span
            key={index}
            className="rounded bg-indigo-50 px-1 font-medium text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
          >
            {segment.value}
          </span>
        ) : (
          <span key={index}>{segment.value}</span>
        ),
      )}
    </p>
  );
}

export function CommentsSection({
  taskId,
  projectId,
  canComment,
  canModerate,
}: {
  taskId: string;
  projectId: string;
  canComment: boolean;
  canModerate: boolean;
}) {
  const me = useMe();
  const comments = useComments(taskId);
  const members = useMembers(projectId);
  const createComment = useCreateComment(taskId);
  const updateComment = useUpdateComment(taskId);
  const deleteComment = useDeleteComment(taskId);

  const [body, setBody] = useState('');
  const [mentionedIds, setMentionedIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Comment | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const memberOptions = (members.data?.members ?? []).map((member) => ({
    id: member.userId,
    displayName: member.displayName,
  }));

  const caret = textareaRef.current?.selectionStart ?? body.length;
  const mention = findMentionQuery(body, caret);
  const suggestions = mention ? filterMentionSuggestions(memberOptions, mention.query, mentionedIds) : [];
  const [mentionHighlight, setMentionHighlight] = useState(0);

  useEffect(() => {
    setMentionHighlight(0);
  }, [mention?.query]);

  const onSelectMention = (user: { id: string; displayName: string }) => {
    if (!mention) return;
    const next = applyMention(body, mention, user);
    setBody(next.value);
    setMentionedIds((current) => [...new Set([...current, user.id])]);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(next.caret, next.caret);
    });
  };

  const submit = () => {
    const text = body.trim();
    if (text.length === 0) {
      toast.error('Write something first');
      return;
    }
    // Only mention people whose name still appears in the submitted text.
    const activeMentions = mentionedIds.filter((id) => {
      const member = memberOptions.find((option) => option.id === id);
      return member ? text.includes(`@${member.displayName}`) : false;
    });

    createComment.mutate(
      { body: text, mentionedUserIds: activeMentions },
      {
        onSuccess: () => {
          setBody('');
          setMentionedIds([]);
          toast.success('Comment added');
        },
        onError: (error) => toast.error('Could not add comment', error.message),
      },
    );
  };

  const items = comments.data?.data.comments ?? [];
  const count = Number(comments.data?.meta.total ?? items.length);

  return (
    <Card>
      <CardHeader title="Comments" description={`${count} comment${count === 1 ? '' : 's'}`} />

      {comments.isLoading && (
        <CardBody className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-4/5" />
        </CardBody>
      )}
      {comments.isError && (
        <CardBody>
          <ErrorState title="Could not load comments" description={comments.error.message} onRetry={() => comments.refetch()} />
        </CardBody>
      )}
      {!comments.isLoading && !comments.isError && items.length === 0 && (
        <CardBody>
          <EmptyState title="No comments yet" description="Discuss the task, mention teammates and record decisions." />
        </CardBody>
      )}

      {items.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((comment) => {
            const isAuthor = comment.author.id === me.data?.id;
            const canDelete = isAuthor || canModerate;
            return (
              <li key={comment.id} className="flex gap-3 px-5 py-4">
                <Avatar name={comment.author.displayName} src={comment.author.avatarUrl} size="md" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {comment.author.displayName}
                    </span>
                    <time
                      className="text-xs text-slate-400 dark:text-slate-500"
                      dateTime={comment.createdAt}
                      title={formatDateTime(comment.createdAt)}
                    >
                      {formatRelative(comment.createdAt)}
                    </time>
                    {comment.editedAt && <span className="text-xs text-slate-400 italic">edited</span>}
                  </div>

                  {editing?.id === comment.id ? (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        label=""
                        aria-label="Edit comment"
                        rows={3}
                        value={editing.body}
                        onChange={(event) => setEditing({ id: comment.id, body: event.target.value })}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          loading={updateComment.isPending}
                          onClick={() =>
                            updateComment.mutate(
                              { commentId: comment.id, body: editing.body.trim() },
                              {
                                onSuccess: () => {
                                  setEditing(null);
                                  toast.success('Comment updated');
                                },
                                onError: (error) => toast.error('Could not update comment', error.message),
                              },
                            )
                          }
                        >
                          Save
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-1">
                      <CommentBody comment={comment} />
                    </div>
                  )}

                  {(isAuthor || canDelete) && editing?.id !== comment.id && (
                    <div className="mt-1.5 flex gap-3 text-xs">
                      {isAuthor && (
                        <button
                          type="button"
                          className="text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
                          onClick={() => setEditing({ id: comment.id, body: comment.body })}
                        >
                          Edit
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          className="text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                          onClick={() => setPendingDelete(comment)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canComment && (
        <CardBody className="border-t border-slate-100 dark:border-slate-800">
          <div className="relative">
            <Textarea
              label="Add a comment"
              rows={3}
              placeholder="Share an update, ask a question or type @ to mention a teammate…"
              value={body}
              ref={textareaRef}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  submit();
                  return;
                }
                if (suggestions.length === 0) return;
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setMentionHighlight((index) => Math.min(index + 1, suggestions.length - 1));
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setMentionHighlight((index) => Math.max(index - 1, 0));
                } else if (event.key === 'Enter' || event.key === 'Tab') {
                  event.preventDefault();
                  onSelectMention(suggestions[mentionHighlight]);
                }
              }}
            />
            {suggestions.length > 0 && (
              <ul
                role="listbox"
                aria-label="Mention suggestions"
                className="absolute z-20 mt-1 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
              >
                {suggestions.map((suggestion, index) => (
                  <li
                    key={suggestion.id}
                    role="option"
                    aria-selected={index === mentionHighlight}
                    onMouseEnter={() => setMentionHighlight(index)}
                    onClick={() => onSelectMention(suggestion)}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm',
                      index === mentionHighlight
                        ? 'bg-indigo-50 dark:bg-indigo-950/50'
                        : 'hover:bg-indigo-50 dark:hover:bg-indigo-950/50',
                    )}
                  >
                    <Avatar name={suggestion.displayName} size="sm" />
                    {suggestion.displayName}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Ctrl/⌘ + Enter to send · @ to mention
              </p>
              <Button size="sm" onClick={submit} loading={createComment.isPending}>
                Comment
              </Button>
            </div>
          </div>
        </CardBody>
      )}

      {!canComment && (
        <CardBody className="border-t border-slate-100 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          Your role can read comments but not post new ones.
        </CardBody>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete comment"
        description="Delete this comment? The task activity feed keeps a record of the deletion."
        confirmLabel="Delete comment"
        loading={deleteComment.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteComment.mutate(pendingDelete.id, {
            onSuccess: () => {
              toast.success('Comment deleted');
              setPendingDelete(null);
            },
            onError: (error) => {
              toast.error('Could not delete comment', error.message);
              setPendingDelete(null);
            },
          });
        }}
        onClose={() => setPendingDelete(null)}
      />
    </Card>
  );
}
