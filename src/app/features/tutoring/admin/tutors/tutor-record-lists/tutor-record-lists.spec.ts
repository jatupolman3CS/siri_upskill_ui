import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { TranslationService } from '../../../../../core/i18n/translation.service';
import { tutorDetail } from '../../testing/fixtures';
import { settle, textOf, useEnglish } from '../../testing/spec-helpers';
import { TutorRecordLists } from './tutor-record-lists';

describe('TutorRecordLists', () => {
  let fixture: ComponentFixture<TutorRecordLists>;

  const root = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    useEnglish();
    fixture = TestBed.createComponent(TutorRecordLists);
  });

  it('shows the offerings with their rates, the education and the certificates', async () => {
    const tutor = tutorDetail();
    fixture.componentRef.setInput('offerings', tutor.offerings);
    fixture.componentRef.setInput('educations', tutor.educations);
    fixture.componentRef.setInput('certificates', tutor.certificates);
    await settle(fixture);
    const text = textOf(root());
    expect(text).toContain('Mathematics');
    expect(text).toContain('฿500.00');
    expect(text).toContain('฿300.00');
    expect(text).toContain('up to 4 seats');
    expect(text).toContain('Chula');
    expect(text).toContain('2008 - 2012');
    expect(text).toContain('Teaching licence');
    expect(text).toContain('KSP · 2014');
    expect(root().querySelector('.overflow-x-auto table')).not.toBeNull();
  });

  it('says so when a tutor has entered nothing', async () => {
    fixture.componentRef.setInput('offerings', []);
    fixture.componentRef.setInput('educations', []);
    fixture.componentRef.setInput('certificates', []);
    await settle(fixture);
    const text = textOf(root());
    expect(text).toContain('No offerings yet.');
    expect(text).toContain('Nothing entered.');
    expect(root().querySelector('table')).toBeNull();
  });

  it('shows the Thai subject name in Thai', async () => {
    TestBed.inject(TranslationService).setLocale('th');
    fixture.componentRef.setInput('offerings', tutorDetail().offerings);
    fixture.componentRef.setInput('educations', []);
    fixture.componentRef.setInput('certificates', []);
    await settle(fixture);
    expect(textOf(root())).toContain('Maths TH');
  });
});
