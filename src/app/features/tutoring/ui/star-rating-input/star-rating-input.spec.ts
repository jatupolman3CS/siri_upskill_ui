import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import { StarRatingInput } from './star-rating-input';

@Component({
  imports: [ReactiveFormsModule, StarRatingInput],
  template: `<app-star-rating-input [formControl]="control" label="Your rating" [required]="true" [errorMessage]="error()" />`,
})
class Host {
  control = new FormControl<number | null>(null);
  readonly error = signal<string | undefined>(undefined);
}

@Component({
  imports: [StarRatingInput],
  template: `<app-star-rating-input [readonly]="true" [rating]="4" />`,
})
class ReadonlyHost {}

describe('StarRatingInput', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Host, ReadonlyHost] });
    useTutoringLanguage('en');
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const radios = (): HTMLInputElement[] => Array.from(root().querySelectorAll<HTMLInputElement>('input[type="radio"]'));

  it('is a radio group of five stars inside a labelled fieldset, with each star named by its value', () => {
    expect(root().querySelector('fieldset legend')?.textContent).toContain('Your rating');
    expect(radios()).toHaveLength(5);
    expect(new Set(radios().map((radio) => radio.name)).size).toBe(1);
    expect(radios().map((radio) => radio.closest('label')?.textContent?.trim())).toEqual([
      '1 of 5 stars',
      '2 of 5 stars',
      '3 of 5 stars',
      '4 of 5 stars',
      '5 of 5 stars',
    ]);
  });

  it('marks the group as required for assistive technology', () => {
    expect(root().querySelector('fieldset')?.getAttribute('aria-required')).toBe('true');
    expect(root().querySelector('legend .sr-only')?.textContent).toContain('required');
  });

  it('writes the chosen star into the form control and shows it as text too (not by the fill alone)', () => {
    radios()[2].click();
    fixture.detectChanges();

    expect(host.control.value).toBe(3);
    expect(radios()[2].checked).toBe(true);
    expect(root().textContent).toContain('3 / 5');
  });

  it('shows a value written by the form', () => {
    host.control.setValue(5);
    fixture.detectChanges();

    expect(radios()[4].checked).toBe(true);
    expect(radios()[0].checked).toBe(false);
    expect(root().textContent).toContain('5 / 5');
  });

  it('is operated with the keyboard like any radio group: each star can take focus, and the focus ring is not removed', () => {
    const first = root().querySelector('label');

    expect(first?.className).toContain('has-[:focus-visible]:ring-2');
    expect(radios().every((radio) => !radio.disabled)).toBe(true);
  });

  it('cannot be changed while the control is disabled', () => {
    host.control.disable();
    fixture.detectChanges();

    expect(radios().every((radio) => radio.disabled)).toBe(true);
  });

  it('announces an error beside the group and points the radios at it', () => {
    host.error.set('Choose a rating from 1 to 5 stars.');
    fixture.detectChanges();

    expect(root().querySelector('[role="alert"]')?.textContent).toContain('Choose a rating');
    expect(radios()[0].getAttribute('aria-invalid')).toBe('true');
  });

  it('draws a read-only rating as one image with a text alternative, and no inputs', () => {
    const readonlyFixture = TestBed.createComponent(ReadonlyHost);
    readonlyFixture.detectChanges();
    const element = readonlyFixture.nativeElement as HTMLElement;

    expect(element.querySelector('input')).toBeNull();
    expect(element.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('4 of 5 stars');
  });
});
