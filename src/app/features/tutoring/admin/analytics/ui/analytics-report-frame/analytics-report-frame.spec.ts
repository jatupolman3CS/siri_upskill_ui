import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import type { ReportStatus } from '../../../data/admin-analytics.util';
import { buttonByText, textOf, useEnglish } from '../../../testing/spec-helpers';
import { AnalyticsReportFrame } from './analytics-report-frame';

@Component({
  imports: [AnalyticsReportFrame],
  template: `
    <app-analytics-report-frame
      headingKey="tutoring.admin.analytics.revenue.heading"
      descriptionKey="tutoring.admin.analytics.revenue.description"
      [status]="status"
      [errorText]="errorText"
      [generatedAtUtc]="generatedAtUtc"
      (refresh)="refreshed = refreshed + 1"
    >
      <p id="projected">the report</p>
    </app-analytics-report-frame>
  `,
})
class Host {
  status: ReportStatus = 'ready';
  errorText: string | null = null;
  generatedAtUtc: string | null = '2026-10-14T03:00:00Z';
  refreshed = 0;
}

describe('AnalyticsReportFrame', () => {
  function mount(patch: Partial<Host> = {}) {
    useEnglish();
    const fixture = TestBed.createComponent(Host);
    Object.assign(fixture.componentInstance, patch);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('shows its heading, what it is, when the server prepared the figures (in Thailand time) and the report', () => {
    const { root } = mount();

    expect(root.querySelector('h2')?.textContent).toContain('Revenue');
    expect(textOf(root)).toContain('Cash that moved and revenue the ledger recognised are two different measurements');
    expect(textOf(root)).toContain('Prepared 14 Oct 2026 10:00');
    expect(root.querySelector('#projected')).not.toBeNull();
  });

  it('is labelled by its heading', () => {
    const { root } = mount();

    const section = root.querySelector('section');
    const heading = root.querySelector('h2');
    expect(section?.getAttribute('aria-labelledby')).toBe(heading?.id);
  });

  it('shows a skeleton and not the report while loading, marks itself busy and disables Refresh', () => {
    const { root } = mount({ status: 'loading', generatedAtUtc: null });

    expect(root.querySelector('[role="status"]')).not.toBeNull();
    expect(root.querySelector('#projected')).toBeNull();
    expect(root.querySelector('section')?.getAttribute('aria-busy')).toBe('true');
    expect(buttonByText(root, 'Refresh')?.disabled).toBe(true);
  });

  it('says what went wrong and offers a retry that asks for a refresh, instead of the report', () => {
    const { fixture, root } = mount({ status: 'error', errorText: 'Reports are busy.' });

    expect(root.querySelector('#projected')).toBeNull();
    expect(textOf(root)).toContain('We could not load this report');
    expect(textOf(root)).toContain('Reports are busy.');

    buttonByText(root, 'Try again')?.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.refreshed).toBe(1);
  });

  it('asks for a refresh from the Refresh button when ready', () => {
    const { fixture, root } = mount();

    const refresh = buttonByText(root, 'Refresh');
    expect(refresh?.disabled).toBe(false);
    refresh?.click();
    expect(fixture.componentInstance.refreshed).toBe(1);
  });
});
