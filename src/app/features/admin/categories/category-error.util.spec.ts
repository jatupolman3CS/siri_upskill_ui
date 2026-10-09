import { ApiError } from '../../../core/http/error.interceptor';
import { mapCategoryError } from './category-error.util';

describe('mapCategoryError', () => {
  it('maps a 409 on create/update to "slug taken" carrying the slug and the server message', () => {
    const view = mapCategoryError('create', new ApiError(409, "Slug 'web' ถูกใช้แล้ว"), { slug: 'web' });

    expect(view.key).toBe('admin.categories.errors.slugTaken');
    expect(view.params).toEqual({ slug: 'web' });
    expect(view.detail).toBe("Slug 'web' ถูกใช้แล้ว");
    expect(mapCategoryError('update', new ApiError(409, 'x'), { slug: 's' }).key).toBe('admin.categories.errors.slugTaken');
  });

  it('maps a 409 on delete to the "has children" refusal and keeps the backend reason as detail', () => {
    const view = mapCategoryError('delete', new ApiError(409, 'ไม่สามารถลบหมวดหมู่ที่มีหมวดหมู่ย่อยอยู่ได้'));

    expect(view.key).toBe('admin.categories.errors.deleteBlocked');
    expect(view.detail).toContain('หมวดหมู่ย่อย');
  });

  it('maps a plain 400 on update to the cycle message, but a validation-shaped 400 to the generic "invalid"', () => {
    expect(mapCategoryError('update', new ApiError(400, 'cycle')).key).toBe('admin.categories.errors.cycle');
    const validation = new ApiError(400, 'One or more validation errors occurred.', undefined, { errors: { Slug: ['bad'] } });
    expect(mapCategoryError('update', validation).key).toBe('admin.categories.errors.invalid');
    expect(mapCategoryError('update', validation).detail).toBeUndefined();
  });

  it('maps a 400 on reorder to the reorder message', () => {
    expect(mapCategoryError('reorder', new ApiError(400, 'ต้องระบุให้ครบ')).key).toBe('admin.categories.errors.reorderInvalid');
  });

  it('maps 404 and the auth failures', () => {
    expect(mapCategoryError('update', new ApiError(404, 'ไม่พบหมวดหมู่นี้')).key).toBe('admin.categories.errors.notFound');
    expect(mapCategoryError('load', new ApiError(403, 'Forbidden')).key).toBe('admin.categories.errors.forbidden');
    expect(mapCategoryError('load', new ApiError(401, 'Unauthorized')).key).toBe('admin.categories.errors.forbidden');
  });

  it('never leaks an unexpected status or a non-ApiError — falls back to the generic message', () => {
    expect(mapCategoryError('create', new ApiError(500, 'boom')).key).toBe('common.error');
    expect(mapCategoryError('create', new ApiError(0, 'common.error')).key).toBe('common.error');
    expect(mapCategoryError('create', new Error('stack trace here')).key).toBe('common.error');
    expect(mapCategoryError('create', null).key).toBe('common.error');
  });

  it('omits the detail when the server sent nothing useful (the interceptor fallback key)', () => {
    expect(mapCategoryError('delete', new ApiError(409, 'common.error')).detail).toBeUndefined();
  });
});
