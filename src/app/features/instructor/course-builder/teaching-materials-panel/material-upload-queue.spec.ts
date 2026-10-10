import { Subject, of, throwError } from 'rxjs';

import { ApiError } from '../../../../core/http/error.interceptor';
import type { TeachingMaterial, TeachingMaterialUploadEvent } from '../../../catalog/data/teaching-materials.models';
import { MaterialUploadQueue } from './material-upload-queue';

const material = (name: string): TeachingMaterial => ({
  id: `id-${name}`,
  fileName: name,
  contentType: 'application/pdf',
  sizeBytes: 1,
  createdAtUtc: '2026-10-10T00:00:00Z',
});
const file = (name: string): File => new File(['x'], name);

describe('MaterialUploadQueue', () => {
  let transfers: Map<string, Subject<TeachingMaterialUploadEvent>>;
  let uploaded: string[];
  let failed: string[];
  let started: string[];
  let queue: MaterialUploadQueue;

  beforeEach(() => {
    transfers = new Map();
    uploaded = [];
    failed = [];
    started = [];
    queue = new MaterialUploadQueue(
      (f) => {
        const transfer = new Subject<TeachingMaterialUploadEvent>();
        transfers.set(f.name, transfer);
        return transfer;
      },
      {
        started: (f) => started.push(f.name),
        uploaded: (m) => uploaded.push(m.fileName),
        failed: (f) => failed.push(f.name),
      },
    );
  });

  const statuses = () => queue.items().map((item) => `${item.file.name}:${item.status}`);

  it('sends files one at a time, in the order they were added', () => {
    queue.add([file('a.pdf'), file('b.pdf')]);
    expect(started).toEqual(['a.pdf']);
    expect(statuses()).toEqual(['a.pdf:uploading', 'b.pdf:queued']);

    const first = transfers.get('a.pdf') as Subject<TeachingMaterialUploadEvent>;
    first.next({ type: 'done', material: material('a.pdf') });
    first.complete();

    expect(uploaded).toEqual(['a.pdf']);
    expect(started).toEqual(['a.pdf', 'b.pdf']);
    expect(statuses()).toEqual(['b.pdf:uploading']);
  });

  it('records progress for the file in flight', () => {
    queue.add([file('a.pdf')]);
    const transfer = transfers.get('a.pdf') as Subject<TeachingMaterialUploadEvent>;
    transfer.next({ type: 'progress', percent: 40 });
    expect(queue.items()[0].percent).toBe(40);
  });

  it('keeps a failed file in the list with its reason and carries on with the next one', () => {
    queue.add([file('bad.pdf'), file('good.pdf')]);
    (transfers.get('bad.pdf') as Subject<TeachingMaterialUploadEvent>).error(new ApiError(409, 'x', 'conflict'));

    expect(failed).toEqual(['bad.pdf']);
    expect(statuses()).toEqual(['bad.pdf:failed', 'good.pdf:uploading']);
    expect(queue.items()[0].error).toEqual({ key: 'teachingMaterials.error.conflict' });
  });

  it('retries a failed file by queueing it again, clearing its old error', () => {
    queue.add([file('a.pdf')]);
    (transfers.get('a.pdf') as Subject<TeachingMaterialUploadEvent>).error(new ApiError(503, 'x', 'unavailable'));
    expect(statuses()).toEqual(['a.pdf:failed']);

    queue.retry(queue.items()[0].id);
    expect(statuses()).toEqual(['a.pdf:uploading']);
    expect(queue.items()[0].error).toBeNull();
    expect(started).toEqual(['a.pdf', 'a.pdf']);
  });

  it('dismisses a failed file but never one that is still uploading', () => {
    queue.add([file('a.pdf'), file('b.pdf')]);
    const [active, waiting] = queue.items();
    queue.dismiss(active.id);
    expect(statuses()).toEqual(['a.pdf:uploading', 'b.pdf:queued']);

    (transfers.get('a.pdf') as Subject<TeachingMaterialUploadEvent>).error(new ApiError(0, 'x'));
    queue.dismiss(active.id);
    expect(statuses()).toEqual(['b.pdf:uploading']);
    expect(waiting.file.name).toBe('b.pdf');
  });

  it('treats a stream that ends without a result as a failure instead of leaving the file "uploading"', () => {
    queue.add([file('a.pdf')]);
    (transfers.get('a.pdf') as Subject<TeachingMaterialUploadEvent>).complete();
    expect(statuses()).toEqual(['a.pdf:failed']);
    expect(failed).toEqual(['a.pdf']);
  });

  it('copes with a transfer that finishes synchronously inside subscribe', () => {
    const synchronous = new MaterialUploadQueue(
      (f) => of<TeachingMaterialUploadEvent>({ type: 'done', material: material(f.name) }),
      { started: () => undefined, uploaded: (m) => uploaded.push(m.fileName), failed: () => undefined },
    );
    synchronous.add([file('a.pdf'), file('b.pdf'), file('c.pdf')]);
    expect(uploaded).toEqual(['a.pdf', 'b.pdf', 'c.pdf']);
    expect(synchronous.items()).toEqual([]);

    const failing = new MaterialUploadQueue(() => throwError(() => new ApiError(500, 'x')), {
      started: () => undefined,
      uploaded: () => undefined,
      failed: (f) => failed.push(f.name),
    });
    failing.add([file('x.pdf'), file('y.pdf')]);
    expect(failed).toEqual(['x.pdf', 'y.pdf']);
  });

  it('aborts the transfer in flight when destroyed', () => {
    queue.add([file('a.pdf')]);
    const transfer = transfers.get('a.pdf') as Subject<TeachingMaterialUploadEvent>;
    expect(transfer.observed).toBe(true);
    queue.destroy();
    expect(transfer.observed).toBe(false);
  });
});
