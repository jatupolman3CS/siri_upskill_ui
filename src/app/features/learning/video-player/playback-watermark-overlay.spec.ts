import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PlaybackWatermarkOverlay, WATERMARK_MOVE_INTERVAL_MS } from './playback-watermark-overlay';
import { WATERMARK_EDGE_MARGIN_PX } from './watermark-position';

/** What the server sends after the SE-02 change: `<displayName> · <email> · <time> UTC`, ~100+ chars with Thai. */
const LONG_THAI_WATERMARK =
  'สมชาย ใจดีมากมายเหลือเกิน นามสกุลยาวพิเศษ · somchai.jaidee.verylongaddress@example-university.ac.th · 2026-10-09 02:37:59 UTC';

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed: Element[] = [];
  disconnectCount = 0;

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }

  observe(element: Element): void {
    this.observed.push(element);
  }

  unobserve(): void {
    // Not used by the component.
  }

  disconnect(): void {
    this.disconnectCount += 1;
    this.observed = [];
  }

  /** Simulates the browser reporting a size change. */
  trigger(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

function setSize(element: HTMLElement, width: number, height: number, kind: 'client' | 'offset'): void {
  Object.defineProperty(element, `${kind}Width`, { configurable: true, value: width });
  Object.defineProperty(element, `${kind}Height`, { configurable: true, value: height });
}

function offsetOf(mark: HTMLElement): { x: number; y: number } {
  const match = /translate3d\(\s*(-?\d+)px,\s*(-?\d+)px/.exec(mark.getAttribute('style') ?? '');
  if (!match) {
    throw new Error(`no translate3d transform on the watermark: ${mark.getAttribute('style')}`);
  }
  return { x: Number(match[1]), y: Number(match[2]) };
}

describe('PlaybackWatermarkOverlay', () => {
  let fixture: ComponentFixture<PlaybackWatermarkOverlay>;
  let host: HTMLElement;

  // Fake timers are on for every test and installed BEFORE the component is created, because the
  // component starts its 8 s hop timer in its constructor.
  beforeEach(async () => {
    vi.useFakeTimers();
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [PlaybackWatermarkOverlay] }).compileComponents();
    fixture = TestBed.createComponent(PlaybackWatermarkOverlay);
    host = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    TestBed.flushEffects();
    await Promise.resolve();
    fixture.detectChanges();
  }

  async function render(text: string): Promise<void> {
    fixture.componentRef.setInput('text', text);
    await settle();
  }

  function mark(): HTMLElement {
    const element = host.querySelector<HTMLElement>('[data-testid="playback-watermark"]');
    if (!element) {
      throw new Error('watermark box not rendered');
    }
    return element;
  }

  function observer(): FakeResizeObserver {
    return FakeResizeObserver.instances[FakeResizeObserver.instances.length - 1];
  }

  /** Lays the frame and box out at the given sizes and lets the component react to the resize. */
  async function layout(frame: { width: number; height: number }, box: { width: number; height: number }): Promise<void> {
    setSize(host, frame.width, frame.height, 'client');
    setSize(mark(), box.width, box.height, 'offset');
    observer().trigger();
    await settle();
  }

  async function hop(): Promise<void> {
    vi.advanceTimersByTime(WATERMARK_MOVE_INTERVAL_MS);
    await settle();
  }

  it('draws nothing while there is no watermark text', async () => {
    await render('');

    expect(host.querySelector('[data-testid="playback-watermark"]')).toBeNull();
  });

  it('renders the full ~100-character Thai + email string untruncated', async () => {
    await render(LONG_THAI_WATERMARK);

    expect(LONG_THAI_WATERMARK.length).toBeGreaterThan(100);
    expect(mark().textContent?.trim()).toBe(LONG_THAI_WATERMARK);
  });

  it('is hidden from assistive tech and cannot intercept pointer events meant for the player controls', async () => {
    await render(LONG_THAI_WATERMARK);

    expect(host.getAttribute('aria-hidden')).toBe('true');
    // jsdom has no stylesheet, so computed styles cannot prove the next three: these utility classes are the guard.
    expect(host.classList.contains('pointer-events-none')).toBe(true);
    expect(mark().classList.contains('pointer-events-none')).toBe(true);
    // Under prefers-reduced-motion the 1 s glide to the next spot is switched off (it jumps instead).
    expect(mark().classList.contains('motion-reduce:transition-none')).toBe(true);
  });

  it('keeps a long watermark fully inside a narrow mobile frame (360px wide, wrapped to the frame width)', async () => {
    await render(LONG_THAI_WATERMARK);
    const frame = { width: 360, height: 203 };
    // CSS caps the box at the frame minus 1rem (16px) and wraps the text; model the wrapped result.
    const box = { width: frame.width - 16, height: 62 };
    vi.spyOn(Math, 'random').mockReturnValue(1);

    await layout(frame, box);
    await hop();

    const { x, y } = offsetOf(mark());
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x + box.width).toBeLessThanOrEqual(frame.width);
    expect(y + box.height).toBeLessThanOrEqual(frame.height);
  });

  it('hops to a new random spot every move interval and never leaves the frame', async () => {
    await render(LONG_THAI_WATERMARK);
    const frame = { width: 640, height: 360 };
    const box = { width: 420, height: 44 };
    await layout(frame, box);
    const random = vi.spyOn(Math, 'random');

    random.mockReturnValue(0);
    await hop();
    expect(offsetOf(mark())).toEqual({ x: WATERMARK_EDGE_MARGIN_PX, y: WATERMARK_EDGE_MARGIN_PX });

    random.mockReturnValue(1);
    await hop();
    expect(offsetOf(mark())).toEqual({
      x: frame.width - box.width - WATERMARK_EDGE_MARGIN_PX,
      y: frame.height - box.height - WATERMARK_EDGE_MARGIN_PX,
    });
  });

  it('re-clamps into the frame when it shrinks (rotation / leaving fullscreen) without waiting for the next hop', async () => {
    await render(LONG_THAI_WATERMARK);
    vi.spyOn(Math, 'random').mockReturnValue(1);
    await layout({ width: 1280, height: 720 }, { width: 500, height: 40 });
    await hop();
    expect(offsetOf(mark()).x).toBe(1280 - 500 - WATERMARK_EDGE_MARGIN_PX);

    await layout({ width: 480, height: 270 }, { width: 464, height: 56 });

    const { x, y } = offsetOf(mark());
    expect(x + 464).toBeLessThanOrEqual(480);
    expect(y + 56).toBeLessThanOrEqual(270);
  });

  it('stops hopping and disconnects the resize observer when destroyed', async () => {
    await render(LONG_THAI_WATERMARK);
    const random = vi.spyOn(Math, 'random');
    random.mockClear();

    fixture.destroy();
    vi.advanceTimersByTime(3 * WATERMARK_MOVE_INTERVAL_MS);

    expect(random).not.toHaveBeenCalled();
    expect(observer().disconnectCount).toBeGreaterThan(0);
  });
});
