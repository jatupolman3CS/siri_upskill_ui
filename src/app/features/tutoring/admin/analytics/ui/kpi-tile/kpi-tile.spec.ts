import { TestBed } from '@angular/core/testing';

import { KpiTile } from './kpi-tile';

describe('KpiTile', () => {
  function render(inputs: Readonly<Record<string, string>>): HTMLElement {
    const fixture = TestBed.createComponent(KpiTile);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('reads label, then value, then hint', () => {
    const root = render({ label: 'Completed', value: '52', hint: 'Last 30 days' });

    expect(Array.from(root.querySelectorAll('p')).map((p) => p.textContent?.trim())).toEqual(['Completed', '52', 'Last 30 days']);
  });

  it('leaves the hint out when there is none', () => {
    const root = render({ label: 'Completed', value: '52' });

    expect(root.querySelectorAll('p')).toHaveLength(2);
    expect(Array.from(root.querySelectorAll('p')).map((p) => p.textContent?.trim())).toEqual(['Completed', '52']);
  });

  it('shows the value as given - the dash for "not enough data" is not turned into a number', () => {
    expect(render({ label: 'Rebook', value: '-' }).querySelectorAll('p')[1].textContent?.trim()).toBe('-');
  });
});
