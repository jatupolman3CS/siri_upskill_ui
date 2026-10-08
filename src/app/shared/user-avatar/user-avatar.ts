import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { phosphorUser } from '@ng-icons/phosphor-icons/regular';

import { initialsOf } from '../../core/auth/initials.util';

export type UserAvatarSize = 'sm' | 'lg';

/**
 * Round user avatar: the profile image when there is one (and it loads), otherwise the person's
 * initials, otherwise a generic person icon. Purely decorative (`aria-hidden`) — whatever contains it
 * (a menu button, a heading with the person's name next to it) carries the accessible name.
 */
@Component({
  selector: 'app-user-avatar',
  imports: [NgOptimizedImage, NgIcon],
  templateUrl: './user-avatar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ phosphorUser })],
  host: { 'aria-hidden': 'true', class: 'inline-block shrink-0' },
})
export class UserAvatar {
  readonly name = input<string | null | undefined>(null);
  readonly src = input<string | null | undefined>(null);
  readonly size = input<UserAvatarSize>('sm');

  /** A broken image URL must fall back to initials instead of leaving a broken-image glyph; resets
   *  whenever a new `src` arrives. */
  protected readonly imageFailed = linkedSignal<string | null | undefined, boolean>({
    source: this.src,
    computation: () => false,
  });

  protected readonly showImage = computed(() => !!this.src() && !this.imageFailed());
  protected readonly initials = computed(() => initialsOf(this.name()));
  protected readonly boxClass = computed(() => (this.size() === 'lg' ? 'size-12 text-lg' : 'size-9 text-sm'));

  protected onImageError(): void {
    this.imageFailed.set(true);
  }
}
