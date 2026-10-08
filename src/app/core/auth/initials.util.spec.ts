import { initialsOf } from './initials.util';

describe('initialsOf', () => {
  it('uses the first letters of the first and last word of a Latin name', () => {
    expect(initialsOf('Somchai Jaidee')).toBe('SJ');
    expect(initialsOf('mary jane watson')).toBe('MW');
  });

  it('uses a single letter for a one-word name', () => {
    expect(initialsOf('Madonna')).toBe('M');
  });

  it('uses the first consonant of a Thai name, skipping leading vowels', () => {
    expect(initialsOf('สมชาย ใจดี')).toBe('สจ');
    expect(initialsOf('เกียรติศักดิ์')).toBe('ก');
    expect(initialsOf('แสงดาว')).toBe('ส');
  });

  it('ignores punctuation and words without letters ((Seed) → S, a lone dash → nothing)', () => {
    expect(initialsOf('ผู้เรียนทดสอบ 1 (Seed)')).toBe('ผS');
    expect(initialsOf('Anna - Lee')).toBe('AL');
    expect(initialsOf('---')).toBe('');
  });

  it('collapses extra whitespace and tolerates empty values', () => {
    expect(initialsOf('  Anna   Lee  ')).toBe('AL');
    expect(initialsOf('')).toBe('');
    expect(initialsOf('   ')).toBe('');
    expect(initialsOf(null)).toBe('');
    expect(initialsOf(undefined)).toBe('');
  });
});
