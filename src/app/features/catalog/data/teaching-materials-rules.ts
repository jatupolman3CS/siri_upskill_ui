/**
 * Client-side pre-checks for teaching-material uploads. These mirror docs/contracts/P4-03c-teaching-materials-r2.md §4.3 so
 * an obviously wrong file is refused before it is sent — a UX courtesy only. The server stays the authority (it also checks
 * the file's real bytes against its extension, scans it, and may be configured with a different size cap).
 */
export const TEACHING_MATERIAL_EXTENSIONS: readonly string[] = [
  '.pdf',
  '.zip',
  '.7z',
  '.gz',
  '.tar.gz',
  '.docx',
  '.xlsx',
  '.pptx',
  '.txt',
  '.csv',
  '.json',
  '.md',
  '.png',
  '.jpg',
  '.jpeg',
];

/** Value for `<input type="file" accept>`. */
export const TEACHING_MATERIAL_ACCEPT = TEACHING_MATERIAL_EXTENSIONS.join(',');

/** The server's default `Catalog:Attachments:MaxFileSizeBytes` (50 MB; it can be raised to 100 MB per deployment). */
export const TEACHING_MATERIAL_MAX_BYTES = 50 * 1024 * 1024;

/** The server's default `MaxAttachmentsPerParent`: files per episode / live session. */
export const TEACHING_MATERIAL_MAX_PER_PARENT = 30;

export type TeachingMaterialRejection = 'empty' | 'tooLarge' | 'type';

/** `null` when the file passes the pre-check, otherwise why it would be refused. */
export function checkTeachingMaterialFile(file: Pick<File, 'name' | 'size'>): TeachingMaterialRejection | null {
  const name = file.name.toLowerCase();
  if (!TEACHING_MATERIAL_EXTENSIONS.some((extension) => name.endsWith(extension))) {
    return 'type';
  }
  if (file.size <= 0) {
    return 'empty';
  }
  return file.size > TEACHING_MATERIAL_MAX_BYTES ? 'tooLarge' : null;
}

export interface RejectedTeachingMaterialFile {
  readonly name: string;
  /** `limit` = the episode / session already holds (or has queued) the maximum number of files. */
  readonly reason: TeachingMaterialRejection | 'limit';
}

/**
 * Splits a batch the user picked into the files worth sending and the ones to explain. `room` is how many more files the
 * target may still take; files are accepted in the order given until it runs out.
 */
export function screenTeachingMaterialFiles(
  files: readonly File[],
  room: number,
): { readonly accepted: readonly File[]; readonly rejected: readonly RejectedTeachingMaterialFile[] } {
  const accepted: File[] = [];
  const rejected: RejectedTeachingMaterialFile[] = [];
  let remaining = room;
  for (const file of files) {
    const rejection = checkTeachingMaterialFile(file);
    if (rejection) {
      rejected.push({ name: file.name, reason: rejection });
    } else if (remaining <= 0) {
      rejected.push({ name: file.name, reason: 'limit' });
    } else {
      accepted.push(file);
      remaining--;
    }
  }
  return { accepted, rejected };
}

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** Human-readable size with binary units ("1.5 MB"); the unit symbols are international, so they are not translated. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), SIZE_UNITS.length - 1);
  return `${parseFloat((bytes / Math.pow(1024, exponent)).toFixed(1))} ${SIZE_UNITS[exponent]}`;
}
