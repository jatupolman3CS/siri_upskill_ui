import {
  TEACHING_MATERIAL_ACCEPT,
  TEACHING_MATERIAL_MAX_BYTES,
  checkTeachingMaterialFile,
  formatFileSize,
  screenTeachingMaterialFiles,
} from './teaching-materials-rules';

const file = (name: string, size = 1024): File => new File([new Uint8Array(Math.min(size, 8))], name, { type: '' });
/** A File that reports a size without allocating it. */
const sized = (name: string, size: number): Pick<File, 'name' | 'size'> => ({ name, size });

describe('checkTeachingMaterialFile', () => {
  it.each(['a.pdf', 'a.zip', 'a.7z', 'a.gz', 'a.tar.gz', 'a.docx', 'a.xlsx', 'a.pptx', 'a.txt', 'a.csv', 'a.json', 'a.md', 'a.png', 'a.jpg', 'a.jpeg'])(
    'accepts %s',
    (name) => {
      expect(checkTeachingMaterialFile(sized(name, 10))).toBeNull();
    },
  );

  it('matches the extension case-insensitively and by the end of the name only', () => {
    expect(checkTeachingMaterialFile(sized('SLIDES.PDF', 10))).toBeNull();
    expect(checkTeachingMaterialFile(sized('archive.tar.gz', 10))).toBeNull();
    expect(checkTeachingMaterialFile(sized('report.pdf.exe', 10))).toBe('type');
  });

  it.each(['setup.exe', 'run.bat', 'x.sh', 'x.ps1', 'x.msi', 'x.jar', 'x.dll', 'noextension', 'x.pdf.'])('refuses %s', (name) => {
    expect(checkTeachingMaterialFile(sized(name, 10))).toBe('type');
  });

  it('refuses an empty file and one above the size cap, but accepts one exactly at it', () => {
    expect(checkTeachingMaterialFile(sized('a.pdf', 0))).toBe('empty');
    expect(checkTeachingMaterialFile(sized('a.pdf', TEACHING_MATERIAL_MAX_BYTES + 1))).toBe('tooLarge');
    expect(checkTeachingMaterialFile(sized('a.pdf', TEACHING_MATERIAL_MAX_BYTES))).toBeNull();
  });

  it('reports the type problem before the size one', () => {
    expect(checkTeachingMaterialFile(sized('a.exe', 0))).toBe('type');
  });
});

describe('screenTeachingMaterialFiles', () => {
  it('splits a batch into accepted files and explained rejections, in order', () => {
    const { accepted, rejected } = screenTeachingMaterialFiles([file('a.pdf'), file('b.exe'), file('c.png')], 10);
    expect(accepted.map((f) => f.name)).toEqual(['a.pdf', 'c.png']);
    expect(rejected).toEqual([{ name: 'b.exe', reason: 'type' }]);
  });

  it('stops accepting once the room runs out and says why for the rest', () => {
    const { accepted, rejected } = screenTeachingMaterialFiles([file('a.pdf'), file('b.pdf'), file('c.pdf')], 2);
    expect(accepted.map((f) => f.name)).toEqual(['a.pdf', 'b.pdf']);
    expect(rejected).toEqual([{ name: 'c.pdf', reason: 'limit' }]);
  });

  it('accepts nothing when there is no room, and reports a bad file by its own problem first', () => {
    const { accepted, rejected } = screenTeachingMaterialFiles([file('a.pdf'), file('b.exe')], 0);
    expect(accepted).toEqual([]);
    expect(rejected).toEqual([
      { name: 'a.pdf', reason: 'limit' },
      { name: 'b.exe', reason: 'type' },
    ]);
  });
});

describe('formatFileSize', () => {
  it.each([
    [0, '0 B'],
    [-5, '0 B'],
    [Number.NaN, '0 B'],
    [512, '512 B'],
    [1024, '1 KB'],
    [1536, '1.5 KB'],
    [1048576, '1 MB'],
    [52428800, '50 MB'],
    [5 * 1024 ** 3, '5 GB'],
  ])('formats %s as %s', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });
});

describe('TEACHING_MATERIAL_ACCEPT', () => {
  it('lists every allowed extension for the file input', () => {
    expect(TEACHING_MATERIAL_ACCEPT.split(',')).toContain('.pdf');
    expect(TEACHING_MATERIAL_ACCEPT.split(',')).toContain('.tar.gz');
    expect(TEACHING_MATERIAL_ACCEPT).not.toContain('.exe');
  });
});
