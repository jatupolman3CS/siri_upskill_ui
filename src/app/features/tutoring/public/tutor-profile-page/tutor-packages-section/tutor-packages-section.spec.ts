import { registerLocaleData } from '@angular/common';
import localeTh from '@angular/common/locales/th';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { errorInterceptor } from '../../../../../core/http/error.interceptor';
import { packageOffer } from '../../../testing/package-fixtures';
import { useTutoringLanguage } from '../../../testing/tutoring-i18n';
import { TutorPackagesSection } from './tutor-packages-section';

registerLocaleData(localeTh);

const URL = '/api/tutoring/tutors/nina-tutor/packages';

describe('TutorPackagesSection', () => {
  let httpMock: HttpTestingController;

  function setUp(): ComponentFixture<TutorPackagesSection> {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    useTutoringLanguage('en');
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TutorPackagesSection);
    fixture.componentRef.setInput('slug', 'nina-tutor');
    return fixture;
  }

  async function settle(fixture: ComponentFixture<TutorPackagesSection>): Promise<void> {
    for (let round = 0; round < 3; round++) {
      fixture.detectChanges();
      TestBed.tick();
      await Promise.resolve();
    }
    fixture.detectChanges();
  }

  afterEach(() => httpMock.verify());

  it('reads the packages in the browser after the first render', async () => {
    const fixture = setUp();
    await settle(fixture);

    httpMock.expectOne(URL).flush([packageOffer()]);
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).querySelector('#tutor-packages-heading')?.textContent).toContain('Lesson packages');
  });

  it('is absent while the packages load and takes no space (no box of its own)', async () => {
    const fixture = setUp();
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).querySelector('section')).toBeNull();
    expect(fixture.nativeElement.className).toContain('contents');
    httpMock.expectOne(URL).flush([]);
  });

  it('asks for nothing until the first render has happened - so the server render never waits for, or breaks on, the packages', async () => {
    const fixture = setUp();
    // Created, not yet rendered: this is as far as a server render goes (render hooks do not run there).
    httpMock.expectNone(URL);

    await settle(fixture);
    httpMock.expectOne(URL).flush([]);
  });

  it('shows the Thai subject name when the language is Thai', async () => {
    const fixture = setUp();
    useTutoringLanguage('th');
    await settle(fixture);
    httpMock.expectOne(URL).flush([packageOffer({ offering: { ...packageOffer().offering, subjectNameTh: 'ฟิสิกส์ (TH)' } })]);
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('ฟิสิกส์ (TH)');
  });

  it('puts the tutor and the package id in the link to the buy page', async () => {
    const fixture = setUp();
    await settle(fixture);
    httpMock.expectOne(URL).flush([packageOffer({ packageId: 'pkg-7' })]);
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).querySelector('a')?.getAttribute('href')).toBe('/tutors/nina-tutor/packages/pkg-7');
  });

  it('gives the buy link a name that says which package it is for', async () => {
    const fixture = setUp();
    await settle(fixture);
    httpMock.expectOne(URL).flush([packageOffer()]);
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).querySelector('a .sr-only')?.textContent).toContain('Physics, 10 lessons of 60 minutes');
  });
});
