import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UserAvatar } from './user-avatar';

@Component({
  selector: 'app-user-avatar-test-host',
  imports: [UserAvatar],
  template: `<app-user-avatar [name]="name()" [src]="src()" />`,
})
class Host {
  readonly name = signal<string | null>('Somchai Jaidee');
  readonly src = signal<string | null>(null);
}

describe('UserAvatar', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  it('is decorative (aria-hidden) — the control that contains it carries the accessible name', () => {
    expect(root().querySelector('app-user-avatar')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows initials when there is no image', () => {
    expect(root().textContent?.trim()).toBe('SJ');
    expect(root().querySelector('img')).toBeNull();
  });

  it('shows the profile image when there is one', () => {
    host.src.set('https://cdn.example.test/avatar.png');
    fixture.detectChanges();

    const img = root().querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('src')).toContain('https://cdn.example.test/avatar.png');
    expect(img.getAttribute('alt')).toBe('');
  });

  it('falls back to initials when the image fails to load, and retries when a new image arrives', () => {
    host.src.set('https://cdn.example.test/broken.png');
    fixture.detectChanges();

    (root().querySelector('img') as HTMLImageElement).dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(root().querySelector('img')).toBeNull();
    expect(root().textContent?.trim()).toBe('SJ');

    host.src.set('https://cdn.example.test/working.png');
    fixture.detectChanges();
    expect(root().querySelector('img')).not.toBeNull();
  });

  it('falls back to a person icon when there is neither an image nor a usable name', () => {
    host.name.set(null);
    fixture.detectChanges();

    expect(root().querySelector('ng-icon')).not.toBeNull();
    expect(root().textContent?.trim()).toBe('');
  });
});
