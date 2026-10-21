import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { settle, textOf, useEnglish } from '../testing/spec-helpers';
import { AdminChip } from './admin-chip';

describe('AdminChip', () => {
  let fixture: ComponentFixture<AdminChip>;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    useEnglish();
    fixture = TestBed.createComponent(AdminChip);
  });

  it('carries meaning in an icon AND words, never in colour alone', async () => {
    fixture.componentRef.setInput('view', { labelKey: 'tutoring.admin.disputes.overdue', icon: 'phosphorClock', tone: 'danger' });
    await settle(fixture);
    const root = fixture.nativeElement as HTMLElement;
    expect(textOf(root)).toBe('Overdue');
    expect(root.querySelector('ng-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('.tone-red')).not.toBeNull();
  });

  it('fills a placeholder of the label', async () => {
    fixture.componentRef.setInput('view', { labelKey: 'tutoring.admin.kyc.waiting', icon: 'phosphorClock', tone: 'warning' });
    fixture.componentRef.setInput('params', { hours: 30 });
    await settle(fixture);
    expect(textOf(fixture.nativeElement as HTMLElement)).toBe('30 h');
  });
});
