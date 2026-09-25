export interface AttachmentDto {
  id: string;
  taskId: string | null;
  projectId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  uploadedBy: { id: string; displayName: string; avatarUrl: string | null };
  isOwner: boolean;
  createdAt: string;
}

export const MAX_UPLOAD_MB = 10;

export const ALLOWED_UPLOAD_EXTENSIONS = [
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'zip',
  'xlsx',
  'docx',
  'txt',
  'md',
  'csv',
  'json',
  'yaml',
  'yml',
  'log',
];

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileExtension(filename: string): string {
  const index = filename.lastIndexOf('.');
  return index === -1 ? '' : filename.slice(index + 1).toLowerCase();
}
