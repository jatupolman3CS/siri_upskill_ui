import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TranslationService } from '../../../../core/i18n/translation.service';
import { MaterialDropZone } from './material-drop-zone';

describe('MaterialDropZone', () => {
  let fixture: ComponentFixture<MaterialDropZone>;
  let picked: (readonly File[])[];

  const root = () => fixture.nativeElement as HTMLElement;
  const zone = () => root().firstElementChild as HTMLElement;
  const fileInput = () => root().querySelector('input[type="file"]') as HTMLInputElement;
  const chooseButton = () =>
    Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.includes('Choose files')) as HTMLButtonElement;

  function dropEvent(type: string, files: File[] = [], relatedTarget: EventTarget | null = null): Event {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files } });
    Object.defineProperty(event, 'relatedTarget', { value: relatedTarget });
    return event;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MaterialDropZone] });
    TestBed.inject(TranslationService).setLocale('en');
    fixture = TestBed.createComponent(MaterialDropZone);
    picked = [];
    fixture.componentInstance.picked.subscribe((files) => picked.push(files));
    fixture.detectChanges();
  });

  it('opens the file dialog from a visible, labelled button (the input itself is not a tab stop)', () => {
    const click = vi.spyOn(fileInput(), 'click').mockImplementation(() => undefined);
    expect(chooseButton()).toBeDefined();
    expect(fileInput().getAttribute('tabindex')).toBe('-1');
    chooseButton().click();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('only offers the allowed extensions to the file dialog and allows several files', () => {
    expect(fileInput().multiple).toBe(true);
    expect(fileInput().accept).toContain('.pdf');
    expect(fileInput().accept).not.toContain('.exe');
  });

  it('states the limits in words', () => {
    expect(root().textContent).toContain('up to 50 MB per file');
    expect(root().textContent).toContain('at most 30 files');
  });

  it('emits the files chosen in the dialog and clears the input so the same file can be chosen again', () => {
    const file = new File(['x'], 'a.pdf');
    Object.defineProperty(fileInput(), 'files', { value: [file], configurable: true });
    fileInput().dispatchEvent(new Event('change'));
    expect(picked).toEqual([[file]]);
    expect(fileInput().value).toBe('');
  });

  it('emits nothing when the dialog is dismissed without a choice', () => {
    Object.defineProperty(fileInput(), 'files', { value: [], configurable: true });
    fileInput().dispatchEvent(new Event('change'));
    expect(picked).toEqual([]);
  });

  it('accepts dropped files, cancelling the browser default of opening them', () => {
    const file = new File(['x'], 'a.pdf');
    const drop = dropEvent('drop', [file]);
    zone().dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(picked).toEqual([[file]]);
  });

  it('marks itself as a drop target while a drag is over it, in words, and unmarks when the drag leaves', () => {
    const over = dropEvent('dragover');
    zone().dispatchEvent(over);
    fixture.detectChanges();
    expect(over.defaultPrevented).toBe(true);
    expect(root().textContent).toContain('Release to add the files');

    // Moving onto a child element is not leaving.
    zone().dispatchEvent(dropEvent('dragleave', [], fileInput()));
    fixture.detectChanges();
    expect(root().textContent).toContain('Release to add the files');

    zone().dispatchEvent(dropEvent('dragleave', [], document.body));
    fixture.detectChanges();
    expect(root().textContent).toContain('Drag files here');
  });

  it('ignores drops and disables the button while the owner says it is busy', () => {
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    const over = dropEvent('dragover');
    zone().dispatchEvent(over);
    zone().dispatchEvent(dropEvent('drop', [new File(['x'], 'a.pdf')]));
    expect(over.defaultPrevented).toBe(false);
    expect(picked).toEqual([]);
    expect(chooseButton().disabled).toBe(true);
  });
});
