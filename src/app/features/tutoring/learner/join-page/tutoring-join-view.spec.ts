import { TUTORING_EN as en, TUTORING_TH as th } from '../../testing/tutoring-i18n';
import { RoomOpener } from './room-opener';
import { TUTORING_JOIN_VIEWS } from './tutoring-join-view';
import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';

function lookup(dictionary: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dictionary);
}

describe('TUTORING_JOIN_VIEWS', () => {
  it.each(Object.entries(TUTORING_JOIN_VIEWS))('gives the %s screen a heading and a body in both languages, and an icon unless it is the spinner', (kind, view) => {
    expect(typeof lookup(th, view.heading)).toBe('string');
    expect(typeof lookup(en, view.heading)).toBe('string');
    expect(typeof lookup(th, view.body)).toBe('string');
    expect(typeof lookup(en, view.body)).toBe('string');
    if (kind !== 'checking') {
      expect(view.icon).not.toBe('');
    }
  });

  it('covers every screen the join page can be in', () => {
    expect(Object.keys(TUTORING_JOIN_VIEWS).sort()).toEqual(
      ['cancelled', 'checking', 'closed', 'ended', 'error', 'notFoundOrNoAccess', 'notOpen', 'rateLimited', 'ready', 'roomNotReady'].sort(),
    );
  });
});

describe('RoomOpener', () => {
  it('opens the room in a new window that cannot reach back into this page', () => {
    const open = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: DOCUMENT, useValue: { defaultView: { open } } }] });

    TestBed.inject(RoomOpener).open('https://meet.google.com/abc');

    expect(open).toHaveBeenCalledWith('https://meet.google.com/abc', '_blank', 'noopener,noreferrer');
  });
});
