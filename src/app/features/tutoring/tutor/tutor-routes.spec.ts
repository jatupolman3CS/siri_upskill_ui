import { verifiedTutorGuard } from '../../../core/guards/verified-tutor.guard';
import { TUTOR_PAGE_ROUTES, TUTOR_ROUTES } from './tutor.routes';

const route = (path: string) => TUTOR_PAGE_ROUTES.find((candidate) => candidate.path === path)!;

describe('Tutor Portal routes and who may open them', () => {
  it.each(['availability', 'packages'])('%s sits behind the verified-tutor check (the API\'s TutorOnly policy is the real gate)', (path) => {
    expect(route(path).canActivate).toEqual([verifiedTutorGuard]);
  });

  it.each(['wallet', 'classes', 'classes/:sessionId'])('%s is NOT behind it: a suspended tutor must still see the money owed, the classes still pending, and cancel a class', (path) => {
    expect(route(path)).toBeDefined();
    expect(route(path).canActivate).toBeUndefined();
  });

  it.each(['', 'profile', 'offerings', 'credentials', 'kyc'])('%s stays open before verification, because it is how a tutor becomes verifiable', (path) => {
    expect(route(path).canActivate).toBeUndefined();
  });

  it('wraps every screen in one route whose resolver loads the portal texts, so the pathless wrapper adds no segment', () => {
    expect(TUTOR_ROUTES).toHaveLength(1);
    expect(TUTOR_ROUTES[0].path).toBe('');
    expect(TUTOR_ROUTES[0].children).toBe(TUTOR_PAGE_ROUTES);
    expect(TUTOR_ROUTES[0].resolve?.['dictionary']).toBeTypeOf('function');
    expect(TUTOR_ROUTES[0].canActivate).toBeUndefined();
  });

  it('lazy-loads every screen', async () => {
    for (const entry of TUTOR_PAGE_ROUTES) {
      expect(entry.loadComponent, entry.path).toBeTypeOf('function');
      expect(await entry.loadComponent!(), entry.path).toBeDefined();
    }
  });
});
