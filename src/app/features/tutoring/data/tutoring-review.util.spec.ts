import { TestBed } from '@angular/core/testing';

import { TranslationService } from '../../../core/i18n/translation.service';
import { useTutoringLanguage } from '../testing/tutoring-i18n';
import { distributionPercentage, formatReviewerLabel } from './tutoring-review.util';

describe('tutoring-review.util', () => {
  let i18n: TranslationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    useTutoringLanguage('en');
    i18n = TestBed.inject(TranslationService);
  });

  describe('formatReviewerLabel', () => {
    it('returns the nickname when reviewer kind is Nickname', () => {
      const label = formatReviewerLabel({ kind: 'Nickname', nickname: 'Mint', gradeBand: null }, i18n);
      expect(label).toBe('Mint');
    });

    it('falls back to anonymous if Nickname kind has null nickname', () => {
      const label = formatReviewerLabel({ kind: 'Nickname', nickname: null, gradeBand: null }, i18n);
      expect(label).toBe('Anonymous user');
    });

    it('formats guardian with primary grade band', () => {
      const label = formatReviewerLabel({ kind: 'Guardian', nickname: null, gradeBand: 'Primary' }, i18n);
      expect(label).toBe('Parent of primary student');
    });

    it('formats guardian with secondary grade band', () => {
      const label = formatReviewerLabel({ kind: 'Guardian', nickname: null, gradeBand: 'Secondary' }, i18n);
      expect(label).toBe('Parent of secondary student');
    });

    it('formats guardian with vocational grade band', () => {
      const label = formatReviewerLabel({ kind: 'Guardian', nickname: null, gradeBand: 'Vocational' }, i18n);
      expect(label).toBe('Parent of vocational student');
    });

    it('formats guardian with general label if grade band is null', () => {
      const label = formatReviewerLabel({ kind: 'Guardian', nickname: null, gradeBand: null }, i18n);
      expect(label).toBe('Parent of student');
    });

    it('formats anonymous user', () => {
      const label = formatReviewerLabel({ kind: 'Anonymous', nickname: null, gradeBand: null }, i18n);
      expect(label).toBe('Anonymous user');
    });
  });

  describe('distributionPercentage', () => {
    it('returns 0 for empty or non-positive total', () => {
      expect(distributionPercentage(0, 0)).toBe(0);
      expect(distributionPercentage(5, 0)).toBe(0);
      expect(distributionPercentage(0, 10)).toBe(0);
    });

    it('calculates rounded percentages correctly', () => {
      expect(distributionPercentage(10, 20)).toBe(50);
      expect(distributionPercentage(1, 3)).toBe(33);
      expect(distributionPercentage(20, 20)).toBe(100);
    });
  });
});
