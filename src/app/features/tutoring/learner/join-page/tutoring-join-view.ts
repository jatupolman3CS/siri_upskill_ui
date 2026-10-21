import {
  phosphorCheckCircle,
  phosphorClock,
  phosphorHourglass,
  phosphorLockKey,
  phosphorProhibit,
  phosphorShieldWarning,
  phosphorVideoCamera,
  phosphorWarning,
} from '@ng-icons/phosphor-icons/regular';

import type { TutoringJoinKind } from './tutoring-join-state';

/** The icons the join page draws (`TutoringJoinView.icon` and the warning notes), registered once by the page. */
export const TUTORING_JOIN_ICONS = {
  phosphorCheckCircle,
  phosphorClock,
  phosphorHourglass,
  phosphorLockKey,
  phosphorProhibit,
  phosphorShieldWarning,
  phosphorVideoCamera,
  phosphorWarning,
};

/** Static presentation of one join-page screen: icon, icon tone and the i18n keys of its heading and body. */
export interface TutoringJoinView {
  readonly icon: string;
  readonly tone: string;
  readonly heading: string;
  readonly body: string;
}

export const TUTORING_JOIN_VIEWS: Readonly<Record<TutoringJoinKind, TutoringJoinView>> = {
  checking: { icon: '', tone: '', heading: 'tutoring.join.checking.heading', body: 'tutoring.join.checking.body' },
  ready: { icon: 'phosphorVideoCamera', tone: 'text-[var(--color-success)]', heading: 'tutoring.join.ready.heading', body: 'tutoring.join.ready.body' },
  notOpen: { icon: 'phosphorClock', tone: 'text-[var(--color-primary-text)]', heading: 'tutoring.join.notOpen.heading', body: 'tutoring.join.notOpen.body' },
  ended: { icon: 'phosphorCheckCircle', tone: 'text-[var(--color-text-muted)]', heading: 'tutoring.join.ended.heading', body: 'tutoring.join.ended.body' },
  cancelled: { icon: 'phosphorProhibit', tone: 'text-[var(--color-danger)]', heading: 'tutoring.join.cancelled.heading', body: 'tutoring.join.cancelled.body' },
  closed: { icon: 'phosphorLockKey', tone: 'text-[var(--color-text-muted)]', heading: 'tutoring.join.closed.heading', body: 'tutoring.join.closed.body' },
  roomNotReady: { icon: 'phosphorHourglass', tone: 'text-[var(--color-warning)]', heading: 'tutoring.join.roomNotReady.heading', body: 'tutoring.join.roomNotReady.body' },
  notFoundOrNoAccess: { icon: 'phosphorLockKey', tone: 'text-[var(--color-text-muted)]', heading: 'tutoring.join.notFound.heading', body: 'tutoring.join.notFound.body' },
  rateLimited: { icon: 'phosphorWarning', tone: 'text-[var(--color-warning)]', heading: 'tutoring.join.rateLimited.heading', body: 'tutoring.join.rateLimited.body' },
  error: { icon: 'phosphorWarning', tone: 'text-[var(--color-danger)]', heading: 'tutoring.join.error.heading', body: 'tutoring.join.error.body' },
};
