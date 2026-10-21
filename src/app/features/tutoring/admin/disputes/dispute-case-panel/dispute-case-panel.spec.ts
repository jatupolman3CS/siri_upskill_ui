import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { TranslationService } from '../../../../../core/i18n/translation.service';
import { disputeDetail } from '../../testing/fixtures';
import { settle, textOf, useEnglish } from '../../testing/spec-helpers';
import { DisputeCasePanel } from './dispute-case-panel';

describe('DisputeCasePanel', () => {
  let fixture: ComponentFixture<DisputeCasePanel>;

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    useEnglish();
    fixture = TestBed.createComponent(DisputeCasePanel);
  });

  it('shows what was reported, the class and the learner as a nickname and grade only', async () => {
    fixture.componentRef.setInput('detail', disputeDetail());
    await settle(fixture);
    const text = textOf(root());
    expect(text).toContain('The tutor never joined the room.');
    expect(text).toContain('Mathematics');
    expect(text).toContain('Nong Mint');
    expect(text).toContain('Secondary 2');
    expect(text).toContain('minor');
    expect(text).toContain('Learner · The class did not take place');
    expect(text).toContain('Completed');
  });

  it('turns the server\'s hint codes into sentences and drops a code it does not know', async () => {
    fixture.componentRef.setInput('detail', disputeDetail({ hints: ['minor_learner', 'repeat_complaint', 'something_new' as never] }));
    await settle(fixture);
    const items = Array.from(root().querySelectorAll('ul[aria-label] li')).map((item) => item.textContent?.trim());
    expect(items).toEqual(['The learner is a minor. Take extra care.', 'This tutor has been complained about repeatedly in the last 90 days.']);
  });

  it('shows no hint list when there are no hints', async () => {
    fixture.componentRef.setInput('detail', disputeDetail({ hints: [] }));
    await settle(fixture);
    expect(root().querySelector('ul[aria-label]')).toBeNull();
  });

  it('opens an evidence link safely in a new tab, showing where it goes', async () => {
    fixture.componentRef.setInput(
      'detail',
      disputeDetail({ evidenceLinks: [{ evidenceId: 'e-1', url: 'https://files.example.com/proof.png', host: 'files.example.com', label: 'Screenshot', addedByRole: 'Learner', addedAtUtc: '2026-10-14T03:00:00Z' }] }),
    );
    await settle(fixture);
    const link = root().querySelector('a[href^="https://files.example.com"]') as HTMLAnchorElement;
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow');
    expect(link.textContent).toContain('Screenshot');
    expect(textOf(root())).toContain('files.example.com');
  });

  it('shows a grade the dictionary does not know as it came', async () => {
    fixture.componentRef.setInput('detail', disputeDetail({ learner: { nickname: 'Nong', gradeLevel: 'Kindergarten', isMinor: false } }));
    await settle(fixture);
    expect(textOf(root())).toContain('Nong · Kindergarten');
  });

  it('follows the language of the page for the subject', async () => {
    TestBed.inject(TranslationService).setLocale('th');
    fixture.componentRef.setInput('detail', disputeDetail());
    await settle(fixture);
    expect(textOf(root())).toContain('Maths TH');
  });
});
