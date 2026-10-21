import { startVisibleInterval } from './visible-interval';

function documentWith(state: DocumentVisibilityState): Document {
  return { visibilityState: state } as Document;
}

describe('startVisibleInterval', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('calls back once per period while the tab is visible', () => {
    const callback = vi.fn();
    const stop = startVisibleInterval(documentWith('visible'), 60_000, callback);

    vi.advanceTimersByTime(59_999);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(120_000);
    expect(callback).toHaveBeenCalledTimes(3);
    stop();
  });

  it('skips ticks while the tab is hidden and resumes when it is visible again', () => {
    const doc = { visibilityState: 'hidden' } as { visibilityState: DocumentVisibilityState };
    const callback = vi.fn();
    const stop = startVisibleInterval(doc as Document, 1_000, callback);

    vi.advanceTimersByTime(5_000);
    expect(callback).not.toHaveBeenCalled();

    doc.visibilityState = 'visible';
    vi.advanceTimersByTime(1_000);
    expect(callback).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stops for good after the returned function is called', () => {
    const callback = vi.fn();
    const stop = startVisibleInterval(documentWith('visible'), 1_000, callback);
    stop();
    vi.advanceTimersByTime(10_000);
    expect(callback).not.toHaveBeenCalled();
  });
});
