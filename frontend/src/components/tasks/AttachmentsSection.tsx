import { useRef, useState } from 'react';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { EmptyState, ErrorState, Skeleton } from '../ui/States';
import { PaperclipIcon } from '../ui/paperclip-icon';
import { useAttachments, useDeleteAttachment, useUploadAttachment } from '../../features/attachments/queries';
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  MAX_UPLOAD_MB,
  fileExtension,
  formatBytes,
  type AttachmentDto,
} from '../../features/attachments/types';
import { attachmentDownloadUrl } from '../../features/attachments/api';
import { formatDateTime, formatRelative } from '../../lib/format';
import { toast } from '../../stores/toastStore';

export function AttachmentsSection({
  taskId,
  canUpload,
  canModerate,
}: {
  taskId: string;
  canUpload: boolean;
  canModerate: boolean;
}) {
  const attachments = useAttachments(taskId);
  const upload = useUploadAttachment(taskId);
  const remove = useDeleteAttachment(taskId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<AttachmentDto | null>(null);

  const onPick = (file: File | undefined) => {
    if (!file) return;
    const extension = fileExtension(file.name);
    if (!ALLOWED_UPLOAD_EXTENSIONS.includes(extension)) {
      toast.error('File type not allowed', `Allowed: ${ALLOWED_UPLOAD_EXTENSIONS.join(', ')}.`);
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      toast.error('File is too large', `Files must be ${MAX_UPLOAD_MB} MB or smaller.`);
      return;
    }
    upload.mutate(file, {
      onSuccess: (result) => toast.success('Attachment uploaded', result.attachment.filename),
      onError: (error) => toast.error('Upload failed', error.message),
      onSettled: () => {
        if (inputRef.current) inputRef.current.value = '';
      },
    });
  };

  const items = attachments.data?.data.attachments ?? [];

  return (
    <Card>
      <CardHeader
        title="Attachments"
        description={`${items.length} file${items.length === 1 ? '' : 's'}`}
        actions={
          canUpload ? (
            <>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                aria-label="Choose a file to upload"
                onChange={(event) => onPick(event.target.files?.[0])}
              />
              <Button
                variant="secondary"
                size="sm"
                loading={upload.isPending}
                onClick={() => inputRef.current?.click()}
              >
                <PaperclipIcon className="text-sm" />
                Upload
              </Button>
            </>
          ) : undefined
        }
      />

      {attachments.isLoading && (
        <CardBody className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </CardBody>
      )}
      {attachments.isError && (
        <CardBody>
          <ErrorState
            title="Could not load attachments"
            description={attachments.error.message}
            onRetry={() => attachments.refetch()}
          />
        </CardBody>
      )}
      {!attachments.isLoading && !attachments.isError && items.length === 0 && (
        <CardBody>
          <EmptyState
            title="No attachments"
            description={
              canUpload
                ? `Upload documents, screenshots or logs (up to ${MAX_UPLOAD_MB} MB).`
                : 'Files uploaded by the team appear here.'
            }
          />
        </CardBody>
      )}

      {items.length > 0 && (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {items.map((attachment) => (
            <li key={attachment.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-500 uppercase dark:bg-slate-800 dark:text-slate-400">
                {fileExtension(attachment.filename).slice(0, 4) || 'file'}
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={attachmentDownloadUrl(attachment.id)}
                  className="block truncate text-sm font-medium text-slate-900 hover:text-indigo-600 dark:text-slate-100 dark:hover:text-indigo-400"
                  download
                >
                  {attachment.filename}
                </a>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>{formatBytes(attachment.sizeBytes)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Avatar name={attachment.uploadedBy.displayName} src={attachment.uploadedBy.avatarUrl} size="sm" />
                    {attachment.uploadedBy.displayName}
                  </span>
                  <span aria-hidden="true">·</span>
                  <time dateTime={attachment.createdAt} title={formatDateTime(attachment.createdAt)}>
                    {formatRelative(attachment.createdAt)}
                  </time>
                </p>
              </div>
              {(attachment.isOwner || canModerate) && (
                <Button variant="ghost" size="sm" onClick={() => setPendingDelete(attachment)}>
                  Delete
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete attachment"
        description={pendingDelete ? `Delete “${pendingDelete.filename}”? Downloads will stop working immediately.` : ''}
        confirmLabel="Delete file"
        loading={remove.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          remove.mutate(pendingDelete.id, {
            onSuccess: () => {
              toast.success('Attachment deleted');
              setPendingDelete(null);
            },
            onError: (error) => {
              toast.error('Could not delete attachment', error.message);
              setPendingDelete(null);
            },
          });
        }}
        onClose={() => setPendingDelete(null)}
      />
    </Card>
  );
}
