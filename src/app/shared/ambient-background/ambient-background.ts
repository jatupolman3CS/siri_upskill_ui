import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Decorative blurred pink / violet / rose blobs behind the whole app (D-24). Mounted once in
 * app.html so every layout (public, learn, instructor, admin) shares it. Purely visual:
 * `aria-hidden`, never intercepts pointer events, sits at z-index -10 above the `<html>` background
 * and below all content (see the note on `html`/`body` in styles.css). Motion and blur sizes are
 * handled by `.app-blob` in styles.css — slow loop on desktop, static and lighter on mobile, off
 * under `prefers-reduced-motion`. Colours are tokens (`--blob-*`) so both themes get matching tints.
 */
@Component({
  selector: 'app-ambient-background',
  template: `
    <div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div
        class="app-blob left-[-10%] top-[-10%] h-[40vw] w-[40vw] bg-[var(--blob-pink)]"
      ></div>
      <div
        class="app-blob right-[-10%] top-[20%] h-[35vw] w-[35vw] bg-[var(--blob-purple)] [animation-delay:-5s]"
      ></div>
      <div
        class="app-blob bottom-[-20%] left-[20%] h-[40vw] w-[40vw] bg-[var(--blob-rose)] [animation-delay:-10s]"
      ></div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AmbientBackground {}
