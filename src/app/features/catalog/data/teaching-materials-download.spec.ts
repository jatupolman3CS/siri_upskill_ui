import { startFileDownload } from './teaching-materials-download';

describe('startFileDownload', () => {
  let click: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('clicks a temporary anchor for an https URL, in the current tab, and cleans it up', () => {
    const url = 'https://acct.r2.cloudflarestorage.com/bucket/key?X-Amz-Signature=abc';
    expect(startFileDownload(document, url, 'slides.pdf')).toBe(true);

    expect(click).toHaveBeenCalledTimes(1);
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.href).toBe(url);
    expect(anchor.download).toBe('slides.pdf');
    expect(anchor.target).toBe('');
    expect(document.body.contains(anchor)).toBe(false);
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>x</script>', '/relative/path', 'not a url', ''])(
    'refuses to follow %s',
    (url) => {
      expect(startFileDownload(document, url, 'x.pdf')).toBe(false);
      expect(click).not.toHaveBeenCalled();
    },
  );
});
