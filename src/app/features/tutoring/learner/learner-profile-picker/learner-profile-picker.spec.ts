import { Component, signal } from '@angular/core';
import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { LearnerProfile } from '../../data/tutoring-learner.models';
import { useTutoringLanguage } from '../../testing/tutoring-i18n';
import { learnerProfile, pagedOf } from '../testing/learner-fixtures';
import { HTTP_TEST_PROVIDERS, buttonByText, settle, textOf } from '../testing/spec-helpers';
import { LearnerProfilePicker } from './learner-profile-picker';

@Component({
  imports: [LearnerProfilePicker],
  template: `<app-learner-profile-picker [(profile)]="chosen" />`,
})
class Host {
  readonly chosen = signal<LearnerProfile | null>(null);
}

const PROFILES_URL = '/api/tutoring/learner-profiles';

describe('LearnerProfilePicker', () => {
  let fixture: ComponentFixture<Host>;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [Host], providers: [...HTTP_TEST_PROVIDERS] });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;
  /** The picker's own learner select (the add-a-learner form has a select of its own, for the school grade). */
  const select = (): HTMLSelectElement | null => root().querySelector('app-learner-profile-picker > app-select select');

  async function answer(profiles: readonly LearnerProfile[]): Promise<void> {
    httpMock.expectOne((request) => request.url === PROFILES_URL).flush(pagedOf(profiles));
    await settle(fixture);
    await settle(fixture);
  }

  it('shows a busy skeleton while the profiles are read', () => {
    expect(root().querySelector('app-skeleton')).not.toBeNull();
    httpMock.expectOne((request) => request.url === PROFILES_URL).flush(pagedOf([]));
  });

  it('picks the only learner there is for the person, so the purchase is never for nobody', async () => {
    await answer([learnerProfile()]);

    expect(select()?.value).toBe('lp-1');
    expect(fixture.componentInstance.chosen()?.nickname).toBe('Mint');
  });

  it('leaves the choice to the person when there are several - a wrong default would buy for the wrong child', async () => {
    await answer([learnerProfile(), learnerProfile({ learnerProfileId: 'lp-2', nickname: 'Fah', gradeLevel: 'Primary3' })]);

    expect(select()?.value).toBe('');
    expect(fixture.componentInstance.chosen()).toBeNull();
    expect(Array.from(select()?.options ?? []).map((option) => option.textContent?.trim())).toEqual(['Choose a learner', 'Mint - Secondary 4 (Grade 10)', 'Fah - Primary 3']);

    select()!.value = 'lp-2';
    select()!.dispatchEvent(new Event('change'));
    await settle(fixture);

    expect(fixture.componentInstance.chosen()?.learnerProfileId).toBe('lp-2');
  });

  it('shows the form to add a learner straight away when the account has none, and offers no select', async () => {
    await answer([]);

    expect(select()).toBeNull();
    expect(root().querySelector('app-learner-profile-form')).not.toBeNull();
    expect(textOf(root())).toContain('Add a learner');
  });

  it('offers to add another learner when there are some, and hides the form again on cancel', async () => {
    await answer([learnerProfile(), learnerProfile({ learnerProfileId: 'lp-2', nickname: 'Fah' })]);

    expect(root().querySelector('app-learner-profile-form')).toBeNull();
    buttonByText(root(), 'Add a new learner')?.click();
    await settle(fixture);
    expect(root().querySelector('app-learner-profile-form')).not.toBeNull();

    buttonByText(root(), 'Cancel')?.click();
    await settle(fixture);
    expect(root().querySelector('app-learner-profile-form')).toBeNull();
  });

  it('says it could not read the learners and reads them again on retry', async () => {
    httpMock.expectOne((request) => request.url === PROFILES_URL).flush({ title: 'x' }, { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    await settle(fixture);

    expect(root().querySelector('[role="alert"]')).not.toBeNull();
    expect(select()).toBeNull();

    buttonByText(root(), 'Try again')?.click();
    await settle(fixture);
    await answer([learnerProfile()]);

    expect(fixture.componentInstance.chosen()?.learnerProfileId).toBe('lp-1');
  });

  it('forgets a learner the server rejected and reads the list again', async () => {
    await answer([learnerProfile()]);
    expect(fixture.componentInstance.chosen()).not.toBeNull();

    const picker = fixture.debugElement.children[0].componentInstance as LearnerProfilePicker;
    picker.forgetAndReload();
    await settle(fixture);
    await answer([learnerProfile({ learnerProfileId: 'lp-9', nickname: 'Kan' })]);

    expect(fixture.componentInstance.chosen()?.learnerProfileId).toBe('lp-9');
  });
});
