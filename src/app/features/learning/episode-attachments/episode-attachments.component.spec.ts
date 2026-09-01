import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EpisodeAttachmentItem } from '../data/learning-api.models';
import { EpisodeAttachmentsComponent } from './episode-attachments.component';

const MOCK_ATTACHMENTS: EpisodeAttachmentItem[] = [
  {
    id: 'att-001',
    episodeId: 'ep-001',
    fileName: 'lecture-slides.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1048576,
    createdAtUtc: '2026-08-27T00:00:00Z',
  },
];

describe('EpisodeAttachmentsComponent', () => {
  let fixture: ComponentFixture<EpisodeAttachmentsComponent>;
  let component: EpisodeAttachmentsComponent;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EpisodeAttachmentsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EpisodeAttachmentsComponent);
    component = fixture.componentInstance;
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('loads attachments on episodeId input change', () => {
    fixture.componentRef.setInput('episodeId', 'ep-001');
    TestBed.flushEffects();

    const req = httpTesting.expectOne('/api/catalog/episodes/ep-001/attachments');
    expect(req.request.method).toBe('GET');
    req.flush(MOCK_ATTACHMENTS);

    expect(component.attachments().length).toBe(1);
    expect(component.attachments()[0].fileName).toBe('lecture-slides.pdf');
    expect(component.formatBytes(1048576)).toBe('1 MB');
  });

  it('handles attachment download authorization call', () => {
    fixture.componentRef.setInput('episodeId', 'ep-001');
    component.attachments.set(MOCK_ATTACHMENTS);

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    component.download(MOCK_ATTACHMENTS[0]);

    const req = httpTesting.expectOne('/api/catalog/episodes/ep-001/attachments/att-001/download');
    expect(req.request.method).toBe('GET');
    req.flush({
      id: 'att-001',
      episodeId: 'ep-001',
      fileName: 'lecture-slides.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1048576,
      downloadUrl: 'https://cdn.siriupskill.com/attachments/ep-001/lecture-slides.pdf',
    });

    expect(openSpy).toHaveBeenCalledWith('https://cdn.siriupskill.com/attachments/ep-001/lecture-slides.pdf', '_blank');
  });
});
