import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import { TutorTextarea } from './tutor-textarea';

@Component({
  imports: [ReactiveFormsModule, TutorTextarea],
  template: `<app-tutor-textarea [formControl]="control" label="Topics" helperText="Help text" [errorMessage]="error()" [required]="true" [maxLength]="10" />`,
})
class Host {
  readonly control = new FormControl('start', { nonNullable: true });
  readonly error = signal<string | undefined>(undefined);
}

describe('TutorTextarea', () => {
  function create() {
    useTutoringLanguage('en');
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return { fixture, root, area: root.querySelector('textarea')! };
  }

  it('is a labelled control that reads and writes the form value', () => {
    const { fixture, root, area } = create();
    expect(root.querySelector('label')?.getAttribute('for')).toBe(area.id);
    expect(area.value).toBe('start');
    expect(area.getAttribute('aria-required')).toBe('true');

    area.value = 'typed';
    area.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.control.value).toBe('typed');

    fixture.componentInstance.control.setValue('set by code');
    fixture.detectChanges();
    expect(area.value).toBe('set by code');
  });

  it('shows the helper text and a counter, and swaps the helper for the error with aria wiring', () => {
    const { fixture, root, area } = create();
    expect(root.textContent).toContain('Help text');
    expect(root.textContent).toContain('5/10 characters');
    expect(area.getAttribute('aria-invalid')).toBeNull();

    fixture.componentInstance.error.set('Too short');
    fixture.detectChanges();
    const alert = root.querySelector('[role=alert]')!;
    expect(alert.textContent).toContain('Too short');
    expect(root.textContent).not.toContain('Help text');
    expect(area.getAttribute('aria-invalid')).toBe('true');
    expect(area.getAttribute('aria-describedby')).toBe(alert.id);
  });

  it('is disabled with its form control', () => {
    const { fixture, area } = create();
    fixture.componentInstance.control.disable();
    fixture.detectChanges();
    expect(area.disabled).toBe(true);
  });
});
