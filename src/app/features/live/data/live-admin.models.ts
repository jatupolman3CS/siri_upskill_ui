import type { IsoUtc } from './live.models';

/**
 * Wire shapes of `GET /api/live/admin/status` (AdminOnly, `Cache-Control: no-store`) — mirrored field for field from the
 * agreed response; if the backend record disagrees, the backend wins: report it, do not guess.
 */

/** One running Hangfire server (a heartbeat older than a minute or so means it is stuck or gone). */
export interface LiveAdminJobServerInstance {
  readonly name: string;
  readonly startedAtUtc: IsoUtc;
  readonly heartbeatUtc: IsoUtc;
}

export interface LiveAdminJobServer {
  readonly running: boolean;
  readonly serverCount: number;
  readonly servers: readonly LiveAdminJobServerInstance[];
}

export interface LiveAdminRecurringJob {
  readonly id: string;
  /** Raw cron expression, shown verbatim. */
  readonly cron: string;
  readonly lastExecutionUtc: IsoUtc | null;
  readonly nextExecutionUtc: IsoUtc | null;
  /** Hangfire job state name (`Succeeded`, `Failed`, `Processing`, ...) or `null` when it never ran. */
  readonly lastJobState: string | null;
}

export type LiveAdminEmailProvider = 'Smtp' | 'Log' | 'Unconfigured';

export interface LiveAdminEmail {
  readonly provider: LiveAdminEmailProvider;
  readonly pendingCount: number;
  readonly failedCount: number;
  /** Age of the oldest unsent message in seconds, or `null` when nothing is waiting. */
  readonly oldestPendingAgeSeconds: number | null;
}

export type LiveAdminLiveProvider = 'GoogleMeet' | 'ManualOnly' | 'Logging';

export interface LiveAdminLiveSettings {
  readonly provider: LiveAdminLiveProvider;
  readonly googleConfigured: boolean;
  readonly publicBaseUrl: string;
  readonly meetingsPending: number;
  readonly meetingsAwaitingLink: number;
  readonly meetingsFailed: number;
  readonly invitesPending: number;
}

export interface LiveAdminStatus {
  /** The server's clock at the moment of the snapshot — every relative time on the page is measured against it. */
  readonly serverTimeUtc: IsoUtc;
  readonly jobServer: LiveAdminJobServer;
  readonly recurringJobs: readonly LiveAdminRecurringJob[];
  readonly email: LiveAdminEmail;
  readonly live: LiveAdminLiveSettings;
  /** Stable machine codes, e.g. `no_job_server`. Empty means everything the server can check is fine. */
  readonly warnings: readonly string[];
}
