export interface MentionSuggestion {
  id: string;
  displayName: string;
}

export interface MentionQuery {
  /** Text typed after the '@' sign. */
  query: string;
  /** Index of the '@' character in the value. */
  start: number;
}

/**
 * Detects an unfinished `@mention` immediately before the caret.
 *
 * Supports multi-word display names but stops at sentence boundaries and after
 * three words, and requires the '@' to start a word — so email addresses and
 * code snippets are never treated as mentions. Returns null when the caret is
 * not inside a mention token.
 */
export function findMentionQuery(value: string, caret: number): MentionQuery | null {
  const before = value.slice(0, caret);
  const atIndex = before.lastIndexOf('@');
  if (atIndex === -1) return null;

  const charBefore = atIndex > 0 ? before[atIndex - 1] : ' ';
  if (!/[\s([]/.test(charBefore)) return null;

  const query = before.slice(atIndex + 1);
  if (query.length > 40) return null;
  if (/[.,;:!?()\n]/.test(query)) return null;
  if (query.split(/\s+/).filter(Boolean).length > 3) return null;

  return { query, start: atIndex };
}

/** Replaces the mention token with the chosen display name. */
export function applyMention(
  value: string,
  mention: MentionQuery,
  user: MentionSuggestion,
): { value: string; caret: number } {
  const insertion = `@${user.displayName} `;
  const next = `${value.slice(0, mention.start)}${insertion}${value.slice(mention.start + 1 + mention.query.length)}`;
  return { value: next, caret: mention.start + insertion.length };
}

export function filterMentionSuggestions(
  candidates: MentionSuggestion[],
  query: string,
  excludedIds: string[] = [],
): MentionSuggestion[] {
  const term = query.trim().toLowerCase();
  return candidates
    .filter((candidate) => !excludedIds.includes(candidate.id))
    .filter((candidate) => !term || candidate.displayName.toLowerCase().includes(term))
    .slice(0, 6);
}

export interface CommentSegment {
  type: 'text' | 'mention';
  value: string;
}

/**
 * Splits a comment body into plain text and mention segments for highlighting.
 * Only names recorded on the comment are highlighted, so a random `@word` stays
 * plain text.
 */
export function splitByMentions(body: string, mentionNames: string[]): CommentSegment[] {
  const names = mentionNames.filter(Boolean).sort((a, b) => b.length - a.length);
  if (names.length === 0) return [{ type: 'text', value: body }];

  const pattern = new RegExp(`@(?:${names.map(escapeRegExp).join('|')})`, 'g');
  const segments: CommentSegment[] = [];
  let lastIndex = 0;
  for (const match of body.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) segments.push({ type: 'text', value: body.slice(lastIndex, index) });
    segments.push({ type: 'mention', value: match[0] });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < body.length) segments.push({ type: 'text', value: body.slice(lastIndex) });
  return segments;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
