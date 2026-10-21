import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { kycCase } from '../../testing/fixtures';
import { settle, textOf, useEnglish } from '../../testing/spec-helpers';
import { KycCaseSummary } from './kyc-case-summary';

describe('KycCaseSummary', () => {
  let fixture: ComponentFixture<KycCaseSummary>;

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    useEnglish();
    fixture = TestBed.createComponent(KycCaseSummary);
  });

  it('shows who applied, the consent they accepted and which documents are required', async () => {
    fixture.componentRef.setInput('detail', kycCase());
    await settle(fixture);
    const text = textOf(root());
    expect(text).toContain('Khun Somchai');
    expect(text).toContain('Maths tutor');
    expect(text).toContain('Version 2026-10-v1 on');
    expect(text).toContain('National ID card, Degree or diploma');
    expect(text).toContain('Awaiting review');
    expect(root().querySelector('a[href="/admin/tutoring/tutors/tutor-1"]')).not.toBeNull();
  });

  it('shows the decision and the note the applicant was given once decided', async () => {
    fixture.componentRef.setInput('detail', kycCase({ status: 'NeedsInfo', decidedAtUtc: '2026-10-14T05:00:00Z', decisionNote: 'Please upload a clearer photo.' }));
    await settle(fixture);
    const text = textOf(root());
    expect(text).toContain('Decided on');
    expect(text).toContain('Please upload a clearer photo.');
  });
});
