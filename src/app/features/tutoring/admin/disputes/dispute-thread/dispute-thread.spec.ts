import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { disputeMessage } from '../../testing/fixtures';
import { settle, textOf, useEnglish } from '../../testing/spec-helpers';
import { DisputeThread } from './dispute-thread';

describe('DisputeThread', () => {
  let fixture: ComponentFixture<DisputeThread>;

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    useEnglish();
    fixture = TestBed.createComponent(DisputeThread);
  });

  it('says so when nobody has written yet', async () => {
    fixture.componentRef.setInput('messages', []);
    await settle(fixture);
    expect(textOf(root())).toContain('No messages yet.');
  });

  it('shows each line with who wrote it, in order, as plain text', async () => {
    fixture.componentRef.setInput('messages', [
      disputeMessage({ messageId: 'a', authorRole: 'Learner', body: 'It never started <b>x</b>' }),
      disputeMessage({ messageId: 'b', authorRole: 'Tutor', body: 'My connection dropped.' }),
    ]);
    await settle(fixture);
    const items = Array.from(root().querySelectorAll('ol > li'));
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Learner');
    expect(items[0].textContent).toContain('It never started <b>x</b>');
    expect(items[0].querySelector('b')).toBeNull();
    expect(items[1].textContent).toContain('Tutor');
  });

  it('boxes an internal note and says in words, with a lock icon, that only administrators see it', async () => {
    fixture.componentRef.setInput('messages', [disputeMessage({ authorRole: 'Admin', visibility: 'Internal', body: 'Check the logs.' }), disputeMessage({ messageId: 'p', authorRole: 'Admin', visibility: 'Parties', body: 'Please reply.' })]);
    await settle(fixture);
    const [internal, parties] = Array.from(root().querySelectorAll('ol > li'));
    expect(internal.textContent).toContain('Internal note, administrators only');
    expect(internal.querySelector('ng-icon[name="phosphorLockKey"]')).not.toBeNull();
    expect(parties.textContent).not.toContain('Internal note');
    expect(parties.querySelector('ng-icon[name="phosphorLockKey"]')).toBeNull();
  });

  it('translates a system line from its code and never shows the raw code', async () => {
    fixture.componentRef.setInput('messages', [disputeMessage({ kind: 'System', authorRole: 'System', body: 'claimed' }), disputeMessage({ messageId: 'z', kind: 'System', authorRole: 'System', body: 'brand_new_code' })]);
    await settle(fixture);
    const text = textOf(root());
    expect(text).toContain('Our team started reviewing the report.');
    expect(text).toContain('The report was updated.');
    expect(text).not.toContain('claimed');
    expect(text).not.toContain('brand_new_code');
  });

  it('opens an attached link in a new tab with the host beside it', async () => {
    fixture.componentRef.setInput('messages', [
      disputeMessage({ evidenceLinks: [{ evidenceId: 'e', url: 'https://example.org/a', host: 'example.org', label: null, addedByRole: 'Tutor', addedAtUtc: '2026-10-14T03:00:00Z' }] }),
    ]);
    await settle(fixture);
    const link = root().querySelector('a[href="https://example.org/a"]') as HTMLAnchorElement;
    expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow');
    expect(link.textContent).toContain('example.org');
  });
});
