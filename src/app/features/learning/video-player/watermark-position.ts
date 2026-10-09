/** A width/height pair in CSS pixels. */
export interface WatermarkBox {
  readonly width: number;
  readonly height: number;
}

/** A top-left offset in CSS pixels, relative to the player frame's top-left corner. */
export interface WatermarkOffset {
  readonly x: number;
  readonly y: number;
}

/** Breathing room kept between the watermark and every edge of the player frame. */
export const WATERMARK_EDGE_MARGIN_PX = 8;

/**
 * Where to put the moving anti-piracy watermark (SE-02) so it is ALWAYS fully inside the frame.
 *
 * `fractionX`/`fractionY` (0..1) say how far along the free range the watermark sits — the random
 * part, redrawn on a timer. The free range is whatever room is left after the watermark's own size
 * and the edge margins, so a long, wrapped watermark simply has less room to move rather than
 * spilling out of the frame (where `overflow-hidden` would silently cut it off). A watermark as
 * large as the frame, or a frame that is not laid out yet (jsdom, SSR), degrades to the margin
 * corner and never to a negative offset.
 */
export function computeWatermarkOffset(
  frame: WatermarkBox,
  mark: WatermarkBox,
  fractionX: number,
  fractionY: number,
  margin: number = WATERMARK_EDGE_MARGIN_PX,
): WatermarkOffset {
  const freeX = Math.max(0, frame.width - mark.width - 2 * margin);
  const freeY = Math.max(0, frame.height - mark.height - 2 * margin);
  return {
    x: Math.round(margin + clamp01(fractionX) * freeX),
    y: Math.round(margin + clamp01(fractionY) * freeY),
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}
