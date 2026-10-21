import { type Signal, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type { Observable } from 'rxjs';

import { TranslationService } from '../../../../core/i18n/translation.service';
import { analyticsErrorOf } from '../data/admin-analytics-errors';
import { type ReportStatus, reportStatusOf } from '../data/admin-analytics.util';

/** What a report component needs from its fetch: the report (guarded), how to show its state, the words for a failure, and a way to read it again. */
export interface AnalyticsReportState<R> {
  /** The latest report, or `undefined` before the first answer and after a failure (never reads a resource in its error state). */
  readonly report: Signal<R | undefined>;
  readonly status: Signal<ReportStatus>;
  /** Already-translated words for a failure, `null` when there is none. */
  readonly errorText: Signal<string | null>;
  readonly reload: () => void;
}

/**
 * The fetch every analytics report component does the same way: read when `params()` has a value (`undefined` waits), read again when it
 * changes, keep the old figures on screen during a refresh, guard `.value()` against the error state. Call it from a field initializer.
 */
export function injectAnalyticsReport<P, R>(options: { readonly params: () => P | undefined; readonly load: (params: P) => Observable<R> }): AnalyticsReportState<R> {
  const i18n = inject(TranslationService);
  const resource = rxResource({ params: options.params, stream: ({ params }) => options.load(params as P) });
  return {
    report: computed(() => (resource.hasValue() ? resource.value() : undefined)),
    status: computed(() => reportStatusOf(resource)),
    errorText: computed(() => {
      if (resource.status() !== 'error') {
        return null;
      }
      const { key, params } = analyticsErrorOf(resource.error());
      return i18n.t(key, params);
    }),
    reload: () => resource.reload(),
  };
}
