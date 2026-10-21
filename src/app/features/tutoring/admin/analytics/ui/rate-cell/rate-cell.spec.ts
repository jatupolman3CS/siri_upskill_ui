import { TestBed } from '@angular/core/testing';

import { textOf, useEnglish } from '../../../testing/spec-helpers';
import { RateCell } from './rate-cell';

describe('RateCell', () => {
  function render(rate: number | null, numerator: number, denominator: number): HTMLElement {
    useEnglish();
    const fixture = TestBed.createComponent(RateCell);
    fixture.componentRef.setInput('rate', rate);
    fixture.componentRef.setInput('numerator', numerator);
    fixture.componentRef.setInput('denominator', denominator);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('writes the rate as a percentage beside the counts it is made of, and draws a bar', () => {
    const root = render(0.425, 17, 40);

    expect(textOf(root)).toContain('42.5%');
    expect(textOf(root)).toContain('17 of 40');
    expect(root.querySelector<HTMLElement>('[aria-hidden="true"] > div')?.style.width).toBe('42.5%');
  });

  it('shows a real zero as 0%, not as missing data', () => {
    const root = render(0, 0, 12);

    expect(textOf(root)).toContain('0%');
    expect(textOf(root)).not.toContain('Not enough data');
  });

  it('shows a rate the server did not report as a dash with "not enough data" in words, never 0%', () => {
    const root = render(null, 1, 3);

    expect(textOf(root)).toContain('Not enough data');
    expect(textOf(root)).not.toContain('%');
    expect(textOf(root)).toContain('1 of 3');
    expect(root.querySelector('.sr-only')?.textContent).toContain('Not enough data');
    expect(root.querySelector('[title="Not enough data"]')?.textContent?.trim()).toBe('-');
    expect(root.querySelector('[aria-hidden="true"] > div')).toBeNull();
  });

  it('keeps the bar inside its track for an out-of-range rate', () => {
    expect(render(1.4, 14, 10).querySelector<HTMLElement>('[aria-hidden="true"] > div')?.style.width).toBe('100%');
  });
});
