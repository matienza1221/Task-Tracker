import { describe, expect, it } from 'vitest';
import { applyMention, filterMentionSuggestions, findMentionQuery, splitByMentions } from './mentions';

describe('findMentionQuery', () => {
  it('detects an unfinished mention before the caret', () => {
    expect(findMentionQuery('Ping @Mar', 9)).toEqual({ query: 'Mar', start: 5 });
    expect(findMentionQuery('@a', 2)).toEqual({ query: 'a', start: 0 });
    expect(findMentionQuery('(see @Dev Per', 13)).toEqual({ query: 'Dev Per', start: 5 });
  });

  it('ignores email addresses and completed sentences', () => {
    expect(findMentionQuery('mail me at dev@example.com', 25)).toBeNull();
    expect(findMentionQuery('@Marvin done with this', 22)).toBeNull();
    expect(findMentionQuery('no mention here', 15)).toBeNull();
  });

  it('ignores absurdly long tokens', () => {
    expect(findMentionQuery(`@${'x'.repeat(41)}`, 42)).toBeNull();
  });
});

describe('applyMention', () => {
  it('replaces the token with the chosen display name and moves the caret', () => {
    const mention = findMentionQuery('Ping @Mar', 9)!;
    const result = applyMention('Ping @Mar', mention, { id: 'u1', displayName: 'Marvin Reyes' });
    expect(result.value).toBe('Ping @Marvin Reyes ');
    expect(result.caret).toBe(result.value.length);
  });

  it('keeps trailing text intact', () => {
    const value = 'Ping @Mar please review';
    const mention = findMentionQuery(value, 9)!;
    const result = applyMention(value, mention, { id: 'u1', displayName: 'Marvin' });
    expect(result.value).toBe('Ping @Marvin  please review');
  });
});

describe('filterMentionSuggestions', () => {
  const candidates = [
    { id: 'u1', displayName: 'Marvin Reyes' },
    { id: 'u2', displayName: 'Jane Dev' },
    { id: 'u3', displayName: 'John Dev' },
  ];

  it('matches case-insensitively and respects the limit', () => {
    expect(filterMentionSuggestions(candidates, 'dev').map((item) => item.id)).toEqual(['u2', 'u3']);
    expect(filterMentionSuggestions(candidates, '').length).toBe(3);
  });

  it('excludes already-mentioned users', () => {
    expect(filterMentionSuggestions(candidates, 'dev', ['u2']).map((item) => item.id)).toEqual(['u3']);
  });
});

describe('splitByMentions', () => {
  it('highlights only recorded mention names', () => {
    const segments = splitByMentions('Thanks @Marvin Reyes and @unknown for the help', ['Marvin Reyes']);
    expect(segments).toEqual([
      { type: 'text', value: 'Thanks ' },
      { type: 'mention', value: '@Marvin Reyes' },
      { type: 'text', value: ' and @unknown for the help' },
    ]);
  });

  it('returns a single text segment when there are no mentions', () => {
    expect(splitByMentions('plain comment', [])).toEqual([{ type: 'text', value: 'plain comment' }]);
  });
});
