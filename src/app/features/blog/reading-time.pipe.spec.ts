import { estimateReadingMinutes } from './reading-time.pipe';

describe('estimateReadingMinutes', () => {
  it('returns null when there is no readable text, never an invented number', () => {
    expect(estimateReadingMinutes(null)).toBeNull();
    expect(estimateReadingMinutes(undefined)).toBeNull();
    expect(estimateReadingMinutes('')).toBeNull();
    expect(estimateReadingMinutes('<p>&nbsp;</p><img src="x.png" alt="">')).toBeNull();
  });

  it('rounds a short article up to one minute', () => {
    expect(estimateReadingMinutes('<p>Hello world</p>')).toBe(1);
  });

  it('counts only visible words, not markup, for Latin text', () => {
    const words = Array.from({ length: 450 }, () => 'word').join(' ');
    expect(estimateReadingMinutes(`<div class="a b c"><p>${words}</p></div>`)).toBe(3);
  });

  it('estimates Thai text, which has no spaces, from its characters', () => {
    const thai = 'ก'.repeat(6 * 400); // ~400 words at the heuristic rate
    expect(estimateReadingMinutes(`<p>${thai}</p>`)).toBe(2);
  });
});
