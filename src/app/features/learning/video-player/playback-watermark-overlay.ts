import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

import { WatermarkBox, computeWatermarkOffset } from './watermark-position';

/** How often the watermark jumps to a new random spot (SE-02 "dynamic movement"). */
export const WATERMARK_MOVE_INTERVAL_MS = 8000;

interface WatermarkLayout {
  readonly frame: WatermarkBox;
  readonly mark: WatermarkBox;
}

const UNMEASURED: WatermarkLayout = { frame: { width: 0, height: 0 }, mark: { width: 0, height: 0 } };

function sameBox(a: WatermarkBox, b: WatermarkBox): boolean {
  return a.width === b.width && a.height === b.height;
}

/**
 * The moving anti-piracy watermark drawn over the video (SE-02): the server-built viewer text
 * (`<displayName> · <email> · <time> UTC` — see `PlaybackSessionService` in the backend), hopping to
 * a random spot inside the player frame every `WATERMARK_MOVE_INTERVAL_MS`.
 *
 * Why this is its own component (it used to be inline in `VideoPlayer`):
 * - The text is now long (a Thai display name + an email + a timestamp can reach ~100 characters), so
 *   the box has a hard `max-width` of the frame and wraps — including inside an unbroken email —
 *   instead of running off the right edge, where the frame's `overflow-hidden` would silently cut the
 *   identifying text off (defeating the whole point of a forensic watermark).
 * - Its position is computed from the MEASURED frame and box sizes (`computeWatermarkOffset`), so it is
 *   always fully inside the frame at any width, in fullscreen, and after the text changes. The size
 *   measurement runs on a `ResizeObserver`; the fractions of the free range stay the same on resize so
 *   the box scales with the frame rather than jumping.
 * - It moves with `transform` (compositor-only) rather than animating `top`/`left`, and the 1 s glide
 *   is switched off under `prefers-reduced-motion` (the watermark still relocates every 8 s — that is a
 *   security feature, not decoration — it just jumps instead of gliding).
 *
 * Contrast is deliberately "low but readable": a 50 % black plate under 75 % white text with a soft
 * shadow stays above ~3:1 even on a pure white frame and far above it on dark video, without the heavy
 * look of an opaque banner. It is `aria-hidden` and `pointer-events-none` so it neither reads the
 * viewer's own identity out loud on every move nor intercepts clicks meant for the video controls.
 *
 * Browser-only work (timer, `ResizeObserver`, DOM measuring) is guarded by `isPlatformBrowser`; on the
 * server the text renders at the margin corner.
 */
@Component({
  selector: 'app-playback-watermark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'pointer-events-none absolute inset-0 z-20 block select-none overflow-hidden',
    'aria-hidden': 'true',
  },
  template: `
    @if (text(); as watermarkText) {
      <div
        #mark
        data-testid="playback-watermark"
        class="pointer-events-none absolute top-0 left-0 max-w-[calc(100%-1rem)] rounded bg-black/50 px-2 py-1 text-[10px] leading-normal text-white/75 select-none [overflow-wrap:anywhere] [text-shadow:0_1px_2px_rgb(0_0_0/0.85)] transition-transform duration-1000 ease-in-out will-change-transform motion-reduce:transition-none sm:text-[11px]"
        [style.transform]="transform()"
      >
        {{ watermarkText }}
      </div>
    }
  `,
})
export class PlaybackWatermarkOverlay {
  /** The server-built watermark text; nothing is drawn while it is empty. */
  readonly text = input<string>('');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly markRef = viewChild<ElementRef<HTMLElement>>('mark');

  /** Where along the free range the box sits (0..1 each way) — the random part, redrawn on a timer. */
  private readonly fraction = signal({ x: 0.3, y: 0.25 });
  private readonly layout = signal<WatermarkLayout>(UNMEASURED, {
    equal: (a, b) => sameBox(a.frame, b.frame) && sameBox(a.mark, b.mark),
  });

  protected readonly transform = computed(() => {
    const { frame, mark } = this.layout();
    const { x: fractionX, y: fractionY } = this.fraction();
    const { x, y } = computeWatermarkOffset(frame, mark, fractionX, fractionY);
    return `translate3d(${x}px, ${y}px, 0)`;
  });

  constructor() {
    if (!this.isBrowser) {
      return;
    }

    const timer = window.setInterval(() => {
      this.fraction.set({ x: Math.random(), y: Math.random() });
    }, WATERMARK_MOVE_INTERVAL_MS);

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.measure());

    // Re-observe whenever the box element is (re)created — e.g. the text goes empty and back — and
    // take a first measurement, so the box is placed correctly on its very first frame.
    effect(() => {
      const mark = this.markRef()?.nativeElement;
      if (observer) {
        observer.disconnect();
        observer.observe(this.host.nativeElement);
        if (mark) {
          observer.observe(mark);
        }
      }
      this.measure();
    });

    this.destroyRef.onDestroy(() => {
      window.clearInterval(timer);
      observer?.disconnect();
    });
  }

  private measure(): void {
    const frame = this.host.nativeElement;
    const mark = this.markRef()?.nativeElement;
    this.layout.set({
      frame: { width: frame.clientWidth, height: frame.clientHeight },
      mark: mark ? { width: mark.offsetWidth, height: mark.offsetHeight } : UNMEASURED.mark,
    });
  }
}
