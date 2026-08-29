import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { Spinner } from './spinner';

describe('Spinner', () => {
  let fixture: ComponentFixture<Spinner>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Spinner],
    }).compileComponents();

    fixture = TestBed.createComponent(Spinner);
    fixture.detectChanges();
  });

  it('renders default md primary spinner', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.getAttribute('role')).toBe('status');
    const ring = el.querySelector('span');
    expect(ring?.classList.contains('animate-spin-fast')).toBe(true);
  });

  it('renders label text when provided', () => {
    fixture.componentRef.setInput('label', 'กำลังตรวจสอบ...');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent?.trim()).toBe('กำลังตรวจสอบ...');
  });
});
