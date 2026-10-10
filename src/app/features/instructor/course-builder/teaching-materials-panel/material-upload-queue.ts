import { signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';

import { type TeachingMaterialMessage, teachingMaterialErrorMessage } from '../../../catalog/data/teaching-materials-errors';
import type { TeachingMaterial, TeachingMaterialUploadEvent } from '../../../catalog/data/teaching-materials.models';

export type UploadStatus = 'queued' | 'uploading' | 'failed';

export interface UploadItem {
  readonly id: number;
  readonly file: File;
  readonly status: UploadStatus;
  /** 0–100 of the request body sent; at 100 the server is still checking and storing the file. */
  readonly percent: number;
  readonly error: TeachingMaterialMessage | null;
}

export interface UploadQueueEvents {
  started(file: File): void;
  uploaded(material: TeachingMaterial, file: File): void;
  failed(file: File, error: TeachingMaterialMessage): void;
}

/**
 * Uploads files one at a time, in the order they were added: a document upload is a single multipart request that the server
 * checks and stores before answering, so sending several at once only slows each of them down. A failed file stays in the
 * list (with its reason) until it is retried or dismissed, and never blocks the files queued behind it.
 */
export class MaterialUploadQueue {
  readonly items = signal<readonly UploadItem[]>([]);

  private nextId = 0;
  /** The transfer in flight; non-null also means "busy", so the next file waits its turn. */
  private current: Subscription | null = null;

  constructor(
    private readonly send: (file: File) => Observable<TeachingMaterialUploadEvent>,
    private readonly events: UploadQueueEvents,
  ) {}

  add(files: readonly File[]): void {
    const added = files.map((file): UploadItem => ({ id: this.nextId++, file, status: 'queued', percent: 0, error: null }));
    this.items.update((list) => [...list, ...added]);
    this.pump();
  }

  retry(id: number): void {
    this.patch(id, { status: 'queued', percent: 0, error: null });
    this.pump();
  }

  dismiss(id: number): void {
    this.items.update((list) => list.filter((item) => item.id !== id || item.status === 'uploading'));
  }

  /** Stops the transfer in flight (the browser aborts the request); used when the owner of the queue goes away. */
  destroy(): void {
    this.current?.unsubscribe();
    this.current = null;
  }

  private pump(): void {
    if (this.current) {
      return;
    }
    const next = this.items().find((item) => item.status === 'queued');
    if (!next) {
      return;
    }
    this.patch(next.id, { status: 'uploading', percent: 0 });
    this.events.started(next.file);
    // Claimed before subscribing: a stream that emits synchronously may finish (and start the next file) inside `subscribe`.
    const upload = new Subscription();
    this.current = upload;
    upload.add(this.send(next.file).subscribe({
      next: (event) => {
        if (event.type === 'progress') {
          this.patch(next.id, { percent: event.percent });
        } else {
          this.items.update((list) => list.filter((item) => item.id !== next.id));
          this.events.uploaded(event.material, next.file);
        }
      },
      error: (error: unknown) => this.fail(next, teachingMaterialErrorMessage(error)),
      complete: () => {
        // A well-behaved stream ends after `uploaded` removed the item; one that ended without it did not finish the job.
        if (this.items().some((item) => item.id === next.id && item.status === 'uploading')) {
          this.fail(next, { key: 'teachingMaterials.error.generic' });
          return;
        }
        this.finish();
      },
    }));
  }

  private fail(item: UploadItem, error: TeachingMaterialMessage): void {
    this.patch(item.id, { status: 'failed', error });
    this.events.failed(item.file, error);
    this.finish();
  }

  private finish(): void {
    this.current = null;
    this.pump();
  }

  private patch(id: number, changes: Partial<UploadItem>): void {
    this.items.update((list) => list.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }
}
