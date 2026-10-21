import { Component, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { settle, textOf } from '../../testing/spec-helpers';
import type { EvidenceRow } from '../feedback-form.util';
import { EvidenceLinksField } from './evidence-links-field';

@Component({
  imports: [EvidenceLinksField],
  template: `<app-evidence-links-field [max]="max()" [showErrors]="showErrors()" (rowsChange)="rows = $event" />`,
})
class Host {
  readonly max = signal(10);
  readonly showErrors = signal(false);
  rows: readonly EvidenceRow[] = [];
  readonly field = viewChild.required(EvidenceLinksField);
}

describe('EvidenceLinksField', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Host] });
    useTutoringLanguage('en');
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    await settle(fixture);
  });

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const addButton = (): HTMLButtonElement => Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.includes('Add a link')) as HTMLButtonElement;
  const inputs = (): HTMLInputElement[] => Array.from(root().querySelectorAll<HTMLInputElement>('input'));

  function type(input: HTMLInputElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('starts empty and says evidence is a link only, https only, with the limit', () => {
    expect(inputs()).toHaveLength(0);
    const text = textOf(root());
    expect(text).toContain('Evidence is a link only');
    expect(text).toContain('Only secure (https) links are accepted');
    expect(text).toContain('up to 10 links');
  });

  it('adds a row with a labelled link field and an optional label, and reports every edit', async () => {
    addButton().click();
    await settle(fixture);
    expect(inputs()).toHaveLength(2);
    expect(root().querySelectorAll('label')).toHaveLength(2);

    type(inputs()[0], 'https://files.example.test/a.png');
    type(inputs()[1], 'Screenshot');
    await settle(fixture);

    expect(host.rows).toEqual([{ url: 'https://files.example.test/a.png', label: 'Screenshot' }]);
  });

  it('removes a row', async () => {
    addButton().click();
    addButton().click();
    await settle(fixture);
    expect(host.rows).toHaveLength(2);

    Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.includes('Remove link'))?.click();
    await settle(fixture);

    expect(host.rows).toHaveLength(1);
  });

  it('stops adding at the capacity it was given', async () => {
    host.max.set(1);
    await settle(fixture);

    addButton().click();
    await settle(fixture);

    expect(addButton().disabled).toBe(true);
    addButton().click();
    await settle(fixture);
    expect(host.rows).toHaveLength(1);
  });

  it('shows what the server would refuse - but only after the parent asks for errors', async () => {
    addButton().click();
    await settle(fixture);
    type(inputs()[0], 'http://insecure.example.test');
    await settle(fixture);
    expect(textOf(root())).not.toContain('Only secure links starting with https://');

    host.showErrors.set(true);
    await settle(fixture);

    expect(textOf(root())).toContain('Only secure links starting with https:// are accepted.');
    expect(inputs()[0].getAttribute('aria-invalid')).toBe('true');
  });

  it('can be emptied by the parent after a message went through', async () => {
    addButton().click();
    await settle(fixture);
    type(inputs()[0], 'https://files.example.test/a.png');

    host.field().clear();
    await settle(fixture);

    expect(inputs()).toHaveLength(0);
    expect(host.rows).toEqual([]);
  });
});
