import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { settle, textOf, useEnglish } from '../testing/spec-helpers';
import { AdminConfirmDialog } from './admin-confirm-dialog';

@Component({
  imports: [AdminConfirmDialog],
  template: `
    <app-admin-confirm-dialog
      [(open)]="open"
      titleText="Suspend this tutor"
      confirmLabel="Suspend"
      [danger]="true"
      [busy]="busy()"
      [problem]="problem()"
      (confirmed)="confirmed = confirmed + 1"
    >
      <p>What will happen.</p>
    </app-admin-confirm-dialog>
  `,
})
class Host {
  readonly open = signal(true);
  readonly busy = signal(false);
  readonly problem = signal<string | null>(null);
  confirmed = 0;
}

describe('AdminConfirmDialog', () => {
  let fixture: ComponentFixture<Host>;

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const buttons = (): HTMLButtonElement[] => Array.from(root().querySelectorAll<HTMLButtonElement>('[modalFooter] app-button button'));

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    useEnglish();
    fixture = TestBed.createComponent(Host);
    await settle(fixture);
  });

  it('shows the projected description under the title with a back and a confirm button', () => {
    const dialog = root().querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(textOf(dialog)).toContain('Suspend this tutor');
    expect(textOf(dialog)).toContain('What will happen.');
    expect(buttons().map((button) => button.textContent?.trim())).toEqual(['Back', 'Suspend']);
  });

  it('does not close on a click on the backdrop (a destructive step)', async () => {
    (root().querySelector('.app-modal-overlay') as HTMLElement).click();
    await settle(fixture);
    expect(root().querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('closes on Back and says confirmed once on Suspend', async () => {
    buttons()[1].click();
    expect(fixture.componentInstance.confirmed).toBe(1);
    buttons()[0].click();
    await settle(fixture);
    expect(root().querySelector('[role="dialog"]')).toBeNull();
  });

  it('cannot be confirmed while the request is in flight', async () => {
    fixture.componentInstance.busy.set(true);
    await settle(fixture);
    expect(buttons().every((button) => button.disabled)).toBe(true);
    buttons()[1].click();
    expect(fixture.componentInstance.confirmed).toBe(0);
  });

  it('shows the failure of the last attempt as an alert', async () => {
    fixture.componentInstance.problem.set('That did not work.');
    await settle(fixture);
    const alert = Array.from(root().querySelectorAll('[role="dialog"] [role="alert"]')).find((element) => element.textContent?.includes('That did not work.'));
    expect(alert).toBeDefined();
  });
});
