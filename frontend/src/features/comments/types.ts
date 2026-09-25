export interface CommentAuthor {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface Comment {
  id: string;
  body: string;
  author: CommentAuthor;
  mentions: { id: string; displayName: string }[];
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommentInput {
  body: string;
  mentionedUserIds?: string[];
}
