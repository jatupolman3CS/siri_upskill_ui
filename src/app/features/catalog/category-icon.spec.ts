import { resolveCategoryIconName, resolveCategoryTone } from './category-icon';

describe('resolveCategoryTone', () => {
  it('gives each seeded category its own hue', () => {
    const tones = ['megaphone', 'code', 'coins'].map((key) => resolveCategoryTone(key));

    expect(new Set(tones).size).toBe(3);
  });

  it('never resolves to a pink/brand tone', () => {
    for (const key of ['megaphone', 'code', 'coins', 'unknown-key', null]) {
      expect(resolveCategoryTone(key)).not.toMatch(/pink|primary/);
    }
  });

  it('falls back to a defined tone for an unknown or null key', () => {
    expect(resolveCategoryTone('something-new')).toBe('tone-violet');
    expect(resolveCategoryTone(null)).toBe('tone-violet');
  });
});

describe('resolveCategoryIconName', () => {
  it('falls back to the folder glyph for an unknown key', () => {
    expect(resolveCategoryIconName('something-new')).toBe('phosphorFolder');
    expect(resolveCategoryIconName(null)).toBe('phosphorFolder');
  });
});
