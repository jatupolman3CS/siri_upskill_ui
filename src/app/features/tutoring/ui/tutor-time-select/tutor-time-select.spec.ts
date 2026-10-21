import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { TutorTimeSelect } from './tutor-time-select';

@Component({
  imports: [TutorTimeSelect],
  template: `<app-tutor-time-select label="From" [choices]="['09:00', '09:30', '10:00']" [(value)]="time" [invalid]="invalid()" [placeholder]="placeholder()" />`,
})
class Host {
  readonly time = signal('09:30');
  readonly invalid = signal(false);
  readonly placeholder = signal<string | undefined>(undefined);
}

describe('TutorTimeSelect', () => {
  function create() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return { fixture, root, select: root.querySelector('select')! };
  }

  it('shows a visible label tied to a native select with the current time chosen', () => {
    const { root, select } = create();
    expect(root.querySelector('label')?.textContent?.trim()).toBe('From');
    expect(root.querySelector('label')?.getAttribute('for')).toBe(select.id);
    expect([...select.options].map((option) => option.value)).toEqual(['09:00', '09:30', '10:00']);
    expect(select.value).toBe('09:30');
  });

  it('writes the picked time back to the owner', () => {
    const { fixture, select } = create();
    select.value = '10:00';
    select.dispatchEvent(new Event('change'));
    expect(fixture.componentInstance.time()).toBe('10:00');
  });

  it('marks itself invalid for assistive technology and can carry a placeholder', () => {
    const { fixture, select } = create();
    fixture.componentInstance.invalid.set(true);
    fixture.componentInstance.placeholder.set('Choose a time');
    fixture.componentInstance.time.set('');
    fixture.detectChanges();
    expect(select.getAttribute('aria-invalid')).toBe('true');
    expect(select.options[0].textContent?.trim()).toBe('Choose a time');
    expect(select.options[0].disabled).toBe(true);
  });
});
