import { describe, expect, it } from 'vitest';

import { formatTutorDisplayName, isDeletedTutor } from './tutor-display-name.util';
import type { TranslationService } from '../../../../core/i18n/translation.service';

describe('tutor-display-name.util', () => {
  const mockI18n = {
    t: (key: string) => (key === 'tutoring.learner.my.deletedTutor' ? 'Deleted tutor' : key),
  } as unknown as TranslationService;

  it('detects deleted tutor by slug prefix deleted-', () => {
    expect(isDeletedTutor({ slug: 'deleted-12345', displayName: 'Jane Doe' })).toBe(true);
    expect(isDeletedTutor({ slug: 'jane-doe', displayName: 'Jane Doe' })).toBe(false);
    expect(isDeletedTutor(null)).toBe(false);
  });

  it('does not infer a deleted tutor from the display name', () => {
    expect(isDeletedTutor({ slug: 'tutor-1', displayName: 'Deleted tutor' })).toBe(false);
    expect(isDeletedTutor({ slug: 'tutor-1', displayName: 'Kru Somchai' })).toBe(false);
    expect(isDeletedTutor({ slug: null, displayName: 'Deleted tutor' })).toBe(false);
  });

  it('formats deleted tutor display name using i18n key', () => {
    expect(formatTutorDisplayName({ slug: 'deleted-abc', displayName: 'Original' }, mockI18n)).toBe('Deleted tutor');
    expect(formatTutorDisplayName({ slug: 'kru-a', displayName: 'Kru A' }, mockI18n)).toBe('Kru A');
    expect(formatTutorDisplayName(null, mockI18n)).toBe('');
  });
});
