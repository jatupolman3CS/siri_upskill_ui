import { TestBed } from '@angular/core/testing';

import { AnalyticsBar, type AnalyticsBarTone } from './analytics-bar';

describe('AnalyticsBar', () => {
  function render(percent: number, tone?: AnalyticsBarTone): HTMLElement {
    const fixture = TestBed.createComponent(AnalyticsBar);
    fixture.componentRef.setInput('percent', percent);
    if (tone !== undefined) {
      fixture.componentRef.setInput('tone', tone);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('is decoration only - hidden from a screen reader, the number beside it carries the meaning', () => {
    const root = render(40);

    expect(root.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(root.textContent?.trim()).toBe('');
  });

  it('fills the given share of its track', () => {
    const fill = render(37.5).querySelector<HTMLElement>('[aria-hidden="true"] > div');

    expect(fill?.style.width).toBe('37.5%');
  });

  it('draws an empty bar for zero', () => {
    const fill = render(0).querySelector<HTMLElement>('[aria-hidden="true"] > div');

    expect(fill?.style.width).toBe('0%');
  });

  it('takes its colour from the tone tokens, never a raw colour', () => {
    expect(render(10, 'red').querySelector('.tone-red')).not.toBeNull();
    expect(render(10, 'green').querySelector('.tone-green')).not.toBeNull();
    expect(render(10).querySelector('.tone-red, .tone-green, .tone-blue, .tone-orange')).toBeNull();
  });
});
