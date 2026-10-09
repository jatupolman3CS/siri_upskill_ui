import { ApiError } from '../../../core/http/error.interceptor';

export type CategoryOperation = 'load' | 'create' | 'update' | 'delete' | 'reorder';

/** An i18n key (plus params) for the user, and — when the server gave one — its own message as a secondary detail. */
export interface CategoryErrorView {
  readonly key: string;
  readonly params?: Readonly<Record<string, string | number>>;
  /** The backend's `DomainError` message (Thai). Shown as extra detail only; never the sole explanation. */
  readonly detail?: string;
}

function hasValidationErrors(details: unknown): boolean {
  return typeof details === 'object' && details !== null && 'errors' in details;
}

/**
 * Maps a failed admin-category call onto translated copy, using the status codes the handlers actually return
 * (`CreateCategoryHandler`/`UpdateCategoryHandler`/`DeleteCategoryHandler`/`ReorderCategoriesHandler`):
 * 404 not found, 409 slug taken (create/update) or children present (delete), 400 cycle (update) / mismatched sibling
 * set (reorder) / FluentValidation field errors. Anything unexpected falls back to the generic error — never a stack
 * trace or the raw English ProblemDetails title.
 */
export function mapCategoryError(
  operation: CategoryOperation,
  error: unknown,
  context: { readonly slug?: string } = {},
): CategoryErrorView {
  if (!(error instanceof ApiError)) {
    return { key: 'common.error' };
  }

  const serverMessage = error.message !== 'common.error' ? error.message : undefined;

  switch (error.status) {
    case 401:
    case 403:
      return { key: 'admin.categories.errors.forbidden' };
    case 404:
      return { key: 'admin.categories.errors.notFound', detail: serverMessage };
    case 409:
      if (operation === 'delete') {
        return { key: 'admin.categories.errors.deleteBlocked', detail: serverMessage };
      }
      return { key: 'admin.categories.errors.slugTaken', params: { slug: context.slug ?? '' }, detail: serverMessage };
    case 400:
      if (hasValidationErrors(error.details)) {
        return { key: 'admin.categories.errors.invalid' };
      }
      if (operation === 'update') {
        return { key: 'admin.categories.errors.cycle', detail: serverMessage };
      }
      if (operation === 'reorder') {
        return { key: 'admin.categories.errors.reorderInvalid', detail: serverMessage };
      }
      return { key: 'admin.categories.errors.invalid', detail: serverMessage };
    default:
      return { key: 'common.error' };
  }
}
