import { type ComponentFixture, TestBed } from '@angular/core/testing';

import type { AdminKycDocument } from '../../data/admin-kyc.models';
import { kycDocument } from '../../testing/fixtures';
import { settle, textOf, useEnglish } from '../../testing/spec-helpers';
import { KycDocumentTable } from './kyc-document-table';

describe('KycDocumentTable', () => {
  let fixture: ComponentFixture<KycDocumentTable>;

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  async function render(documents: readonly AdminKycDocument[], extra: { decidable?: boolean; verdicts?: Record<string, 'Approved' | 'Rejected'> } = {}): Promise<void> {
    fixture.componentRef.setInput('documents', documents);
    fixture.componentRef.setInput('decidable', extra.decidable ?? false);
    fixture.componentRef.setInput('verdicts', extra.verdicts ?? {});
    await settle(fixture);
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    useEnglish();
    fixture = TestBed.createComponent(KycDocumentTable);
  });

  it('describes each document: type, size, state, upload time and when its file is scheduled for deletion', async () => {
    await render([kycDocument({ type: 'IdCard', sizeBytes: 1_572_864, status: 'Approved', purgeAfterUtc: '2026-11-10T03:00:00Z', expiresAtUtc: '2027-01-01T03:00:00Z' })]);
    const text = textOf(root());
    expect(text).toContain('National ID card');
    expect(text).toContain('1.5 MB');
    expect(text).toContain('Approved');
    expect(text).toContain('File deleted by');
    expect(text).toContain('Expires');
  });

  it('warns when the same file is on other tutors\' documents', async () => {
    await render([kycDocument({ sameFileSeenFromOtherTutors: 2 })]);
    expect(root().querySelector('[role="note"]')?.textContent).toContain('2');
  });

  it('shows a deleted file as deleted and does not let it be opened', async () => {
    await render([kycDocument({ purged: true, status: 'Approved' })]);
    expect(textOf(root())).toContain('File deleted');
    expect((root().querySelector('button[id^="kyc-view-"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers verdicts only for a pending document while the case can be decided', async () => {
    await render([kycDocument({ documentId: 'a', status: 'Pending' }), kycDocument({ documentId: 'b', status: 'Approved' })], { decidable: true });
    expect(root().querySelectorAll('input[type="radio"]').length).toBe(3);
    expect(root().querySelector('input[name="verdict-a"]')).not.toBeNull();
    expect(root().querySelector('input[name="verdict-b"]')).toBeNull();

    await render([kycDocument({ status: 'Pending' })], { decidable: false });
    expect(root().querySelectorAll('input[type="radio"]').length).toBe(0);
  });

  it('reports a chosen verdict, and "undecided" as null', async () => {
    await render([kycDocument({ documentId: 'a' })], { decidable: true, verdicts: { a: 'Rejected' } });
    const emitted: unknown[] = [];
    fixture.componentInstance.verdictChange.subscribe((change) => emitted.push(change));
    const radios = Array.from(root().querySelectorAll<HTMLInputElement>('input[name="verdict-a"]'));
    expect(radios.map((radio) => radio.checked)).toEqual([false, false, true]);

    radios[1].click();
    radios[0].click();
    expect(emitted).toEqual([
      { documentId: 'a', status: 'Approved' },
      { documentId: 'a', status: null },
    ]);
  });

  it('asks the page to open a file or its access log', async () => {
    await render([kycDocument({ documentId: 'a' })]);
    const opened: string[] = [];
    const logs: string[] = [];
    fixture.componentInstance.viewDocument.subscribe((document) => opened.push(document.documentId));
    fixture.componentInstance.showLogs.subscribe((document) => logs.push(document.documentId));
    const buttons = Array.from(root().querySelectorAll<HTMLButtonElement>('td button'));
    buttons.find((button) => button.textContent?.includes('Open'))?.click();
    buttons.find((button) => button.textContent?.includes('Access log'))?.click();
    expect(opened).toEqual(['a']);
    expect(logs).toEqual(['a']);
  });
});
