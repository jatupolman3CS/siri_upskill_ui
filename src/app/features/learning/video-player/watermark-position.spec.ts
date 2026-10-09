import { describe, expect, it } from 'vitest';

import { WATERMARK_EDGE_MARGIN_PX, computeWatermarkOffset } from './watermark-position';

describe('computeWatermarkOffset', () => {
  const frame = { width: 640, height: 360 };

  it('keeps the whole box inside the frame at both extremes of the random range', () => {
    const mark = { width: 300, height: 40 };

    const topLeft = computeWatermarkOffset(frame, mark, 0, 0);
    const bottomRight = computeWatermarkOffset(frame, mark, 1, 1);

    expect(topLeft).toEqual({ x: WATERMARK_EDGE_MARGIN_PX, y: WATERMARK_EDGE_MARGIN_PX });
    expect(bottomRight.x + mark.width).toBe(frame.width - WATERMARK_EDGE_MARGIN_PX);
    expect(bottomRight.y + mark.height).toBe(frame.height - WATERMARK_EDGE_MARGIN_PX);
  });

  it('stays inside the frame for every fraction, even for a box nearly as wide as the frame (long Thai + email text)', () => {
    const mark = { width: frame.width - 2 * WATERMARK_EDGE_MARGIN_PX, height: 56 };

    for (let step = 0; step <= 20; step += 1) {
      const fraction = step / 20;
      const { x, y } = computeWatermarkOffset(frame, mark, fraction, fraction);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + mark.width).toBeLessThanOrEqual(frame.width);
      expect(y + mark.height).toBeLessThanOrEqual(frame.height);
    }
  });

  it('moves proportionally with the fraction', () => {
    const mark = { width: 200, height: 30 };
    const middle = computeWatermarkOffset(frame, mark, 0.5, 0.5);

    expect(middle.x).toBe(Math.round(WATERMARK_EDGE_MARGIN_PX + 0.5 * (frame.width - mark.width - 16)));
    expect(middle.y).toBe(Math.round(WATERMARK_EDGE_MARGIN_PX + 0.5 * (frame.height - mark.height - 16)));
  });

  it('falls back to the margin corner (never a negative offset) when the box is larger than the frame', () => {
    expect(computeWatermarkOffset({ width: 200, height: 100 }, { width: 900, height: 400 }, 0.9, 0.9)).toEqual({
      x: WATERMARK_EDGE_MARGIN_PX,
      y: WATERMARK_EDGE_MARGIN_PX,
    });
  });

  it('falls back to the margin corner when nothing is laid out yet (jsdom / SSR)', () => {
    expect(computeWatermarkOffset({ width: 0, height: 0 }, { width: 0, height: 0 }, 0.7, 0.2)).toEqual({
      x: WATERMARK_EDGE_MARGIN_PX,
      y: WATERMARK_EDGE_MARGIN_PX,
    });
  });

  it('clamps out-of-range and non-finite fractions instead of leaving the frame', () => {
    const mark = { width: 100, height: 20 };

    const beyond = computeWatermarkOffset(frame, mark, 5, -3);
    expect(beyond.x + mark.width).toBe(frame.width - WATERMARK_EDGE_MARGIN_PX);
    expect(beyond.y).toBe(WATERMARK_EDGE_MARGIN_PX);

    // A non-finite fraction is treated as invalid input and lands on the safe margin corner.
    expect(computeWatermarkOffset(frame, mark, Number.NaN, Number.POSITIVE_INFINITY)).toEqual({
      x: WATERMARK_EDGE_MARGIN_PX,
      y: WATERMARK_EDGE_MARGIN_PX,
    });
  });
});
