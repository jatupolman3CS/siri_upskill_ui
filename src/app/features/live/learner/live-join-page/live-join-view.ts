import type { JoinStateKind } from './live-join-state';

/** Static presentation of one join-page screen: icon, icon tone and the i18n keys of its heading and body. */
export interface StateView {
  readonly icon: string;
  readonly tone: string;
  readonly heading: string;
  readonly body: string;
}

export const JOIN_VIEWS: Readonly<Record<JoinStateKind, StateView>> = {
  checking: { icon: '', tone: '', heading: 'live.join.checking.heading', body: 'live.join.checking.body' },
  redirecting: {
    icon: 'phosphorVideoCamera',
    tone: 'text-[var(--color-success)]',
    heading: 'live.join.redirecting.heading',
    body: 'live.join.redirecting.body',
  },
  notOpen: {
    icon: 'phosphorClock',
    tone: 'text-[var(--color-primary)]',
    heading: 'live.join.notOpen.heading',
    body: 'live.join.notOpen.body',
  },
  ended: {
    icon: 'phosphorCheckCircle',
    tone: 'text-[var(--color-text-muted)]',
    heading: 'live.join.ended.heading',
    body: 'live.join.ended.body',
  },
  cancelled: {
    icon: 'phosphorProhibit',
    tone: 'text-[var(--color-danger)]',
    heading: 'live.join.cancelled.heading',
    body: 'live.join.cancelled.body',
  },
  roomNotReady: {
    icon: 'phosphorHourglass',
    tone: 'text-[var(--color-warning)]',
    heading: 'live.join.roomNotReady.heading',
    body: 'live.join.roomNotReady.body',
  },
  notFoundOrNoAccess: {
    icon: 'phosphorLockKey',
    tone: 'text-[var(--color-text-muted)]',
    heading: 'live.join.notFound.heading',
    body: 'live.join.notFound.body',
  },
  rateLimited: {
    icon: 'phosphorWarning',
    tone: 'text-[var(--color-warning)]',
    heading: 'live.join.rateLimited.heading',
    body: 'live.join.rateLimited.body',
  },
  error: {
    icon: 'phosphorWarning',
    tone: 'text-[var(--color-danger)]',
    heading: 'live.join.error.heading',
    body: 'live.join.error.body',
  },
};

/** States in which the learner is on their way into the room, i.e. where the do-not-forward / refund notes apply. */
const ENTERING: ReadonlySet<JoinStateKind> = new Set<JoinStateKind>(['checking', 'redirecting', 'notOpen', 'roomNotReady']);

export function isEnteringState(kind: JoinStateKind): boolean {
  return ENTERING.has(kind);
}
