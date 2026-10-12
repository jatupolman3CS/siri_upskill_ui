export interface PlaybackErrorInfo {
  readonly title: string;
  readonly message: string;
  readonly isRecoverable: boolean;
}

/**
 * Maps Shaka Player error codes and native HTML5 media errors to user-friendly, localized error messages.
 * `translate` is injected (the player passes `TranslationService.t`) so this file stays framework-agnostic while the
 * user-facing text lives in th.json/en.json under `learn.playerError.*`.
 */
export function mapShakaPlaybackError(error: unknown, translate: (key: string) => string): PlaybackErrorInfo {
  const info = (id: string, isRecoverable: boolean): PlaybackErrorInfo => ({
    title: translate(`learn.playerError.${id}.title`),
    message: translate(`learn.playerError.${id}.message`),
    isRecoverable,
  });

  if (!error) {
    return info('generic', true);
  }

  const errObj = error as {
    category?: number;
    code?: number;
    severity?: number;
    message?: string;
  };

  const category = errObj.category;
  const code = errObj.code;

  // Shaka Category 6: DRM
  if (category === 6) {
    return code === 6007 || code === 6008 ? info('drmExpired', true) : info('drm', true);
  }

  // Shaka Category 1: Network
  if (category === 1) {
    return code === 1002 ? info('networkHttp', true) : info('network', true);
  }

  // Shaka Category 3: Media
  if (category === 3) {
    return info('media', true);
  }

  // Shaka Category 4: Manifest
  if (category === 4) {
    return info('manifest', true);
  }

  // Shaka Category 5: Streaming
  if (category === 5) {
    return info('streaming', true);
  }

  // Native HTMLMediaElement MediaError
  if (error instanceof Event && (error.target as HTMLMediaElement)?.error) {
    const mediaErr = (error.target as HTMLMediaElement).error;
    if (mediaErr) {
      switch (mediaErr.code) {
        case 1: // MEDIA_ERR_ABORTED
          return info('nativeAborted', true);
        case 2: // MEDIA_ERR_NETWORK
          return info('nativeNetwork', true);
        case 3: // MEDIA_ERR_DECODE
          return info('nativeDecode', false);
        case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
          return info('nativeUnsupported', false);
      }
    }
  }

  // Fallback generic
  return {
    title: translate('learn.playerError.generic.title'),
    message: errObj.message || translate('learn.playerError.fallback.message'),
    isRecoverable: true,
  };
}

/**
 * Maps an X-28 playback-URL renewal failure (an HTTP error from re-fetching the playback session
 * before the current signed URL expires) to the same `PlaybackErrorInfo` shape as
 * `mapShakaPlaybackError` above, so the video player's existing error overlay handles both
 * uniformly. Kept separate from `mapShakaPlaybackError` because the input here is an
 * `HttpErrorResponse` (typed `unknown` to avoid this framework-agnostic error-mapping file taking
 * a dependency on `@angular/common/http`), not a Shaka/native media error. `translate` is injected
 * (the player passes `TranslationService.t`) so this file stays framework-agnostic while the
 * user-facing text lives in th.json/en.json.
 */
export function mapPlaybackRenewalError(error: unknown, translate: (key: string) => string): PlaybackErrorInfo {
  const httpError = error as { status?: number } | null;

  if (httpError?.status === 401 || httpError?.status === 403) {
    return {
      title: translate('learn.renewalError.expiredTitle'),
      message: translate('learn.renewalError.expiredMessage'),
      isRecoverable: true,
    };
  }

  return {
    title: translate('learn.renewalError.failedTitle'),
    message: translate('learn.renewalError.failedMessage'),
    isRecoverable: true,
  };
}
