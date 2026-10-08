import type { StatusView } from '../../live/data/live-instructor.util';

const COURSE_STATUS_VIEWS: Readonly<Record<string, StatusView>> = {
  Draft: { labelKey: 'instructor.dashboard.status.Draft', icon: 'phosphorCircleDashed', tone: 'neutral' },
  InReview: { labelKey: 'instructor.dashboard.status.InReview', icon: 'phosphorHourglass', tone: 'info' },
  Published: { labelKey: 'instructor.dashboard.status.Published', icon: 'phosphorCheckCircle', tone: 'success' },
  Rejected: { labelKey: 'instructor.dashboard.status.Rejected', icon: 'phosphorXCircle', tone: 'danger' },
  Archived: { labelKey: 'instructor.dashboard.status.Archived', icon: 'phosphorProhibit', tone: 'neutral' },
};

const UNKNOWN_COURSE_STATUS: StatusView = {
  labelKey: 'instructor.dashboard.status.unknown',
  icon: 'phosphorCircleDashed',
  tone: 'neutral',
};

/** The course's real status, from the API (`status` is an open string — an unknown future value reads as neutral). */
export function courseStatusView(status: string): StatusView {
  return COURSE_STATUS_VIEWS[status] ?? UNKNOWN_COURSE_STATUS;
}

/** `+14.5%` / `-3.2%` / `0.0%` — the sign is part of the text so direction never relies on colour. */
export function formatChangePercent(percent: number): string {
  const fixed = percent.toFixed(1);
  if (Number(fixed) === 0) {
    return '0.0%'; // never "-0.0%"
  }
  return percent > 0 ? `+${fixed}%` : `${fixed}%`;
}

/** `4.50` -> `4.5`; one decimal is plenty for a star average. */
export function formatRating(average: number): string {
  return average.toFixed(1);
}
