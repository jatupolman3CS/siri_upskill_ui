import { TUTOR_PAGE_ROUTES, TUTOR_ROUTES } from './tutor.routes';
import { verifiedTutorGuard } from '../../../core/guards/verified-tutor.guard';

describe('Tutor Portal dispute routes wiring (P13-35)', () => {
  it('registers disputes and disputes/:disputeId under TUTOR_PAGE_ROUTES without verifiedTutorGuard', () => {
    const disputesList = TUTOR_PAGE_ROUTES.find((r) => r.path === 'disputes');
    const disputeDetail = TUTOR_PAGE_ROUTES.find((r) => r.path === 'disputes/:disputeId');

    expect(disputesList).toBeDefined();
    expect(disputeDetail).toBeDefined();

    // CRITICAL: Must NOT be guarded by verifiedTutorGuard (suspended tutors must be able to view and answer disputes)
    expect(disputesList?.canActivate ?? []).not.toContain(verifiedTutorGuard);
    expect(disputeDetail?.canActivate ?? []).not.toContain(verifiedTutorGuard);
  });

  it('TUTOR_ROUTES wraps pages with loadTutorTutoringDictionary resolver', () => {
    expect(TUTOR_ROUTES).toHaveLength(1);
    expect(TUTOR_ROUTES[0].resolve?.['dictionary']).toBeDefined();
    expect(TUTOR_ROUTES[0].children).toContainEqual(expect.objectContaining({ path: 'disputes' }));
    expect(TUTOR_ROUTES[0].children).toContainEqual(expect.objectContaining({ path: 'disputes/:disputeId' }));
  });
});
