import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';

import { DownloadNavigator } from './download-navigator';

describe('DownloadNavigator', () => {
  it('sends the window to the signed address (the file arrives as an attachment)', () => {
    const assign = vi.fn();
    TestBed.configureTestingModule({ providers: [{ provide: DOCUMENT, useValue: { defaultView: { location: { assign } } } }] });

    TestBed.inject(DownloadNavigator).go('https://files.example.test/signed');

    expect(assign).toHaveBeenCalledWith('https://files.example.test/signed');
  });

  it('does nothing without a window (server render)', () => {
    TestBed.configureTestingModule({ providers: [{ provide: DOCUMENT, useValue: { defaultView: null } }] });

    expect(() => TestBed.inject(DownloadNavigator).go('https://files.example.test/signed')).not.toThrow();
  });
});
