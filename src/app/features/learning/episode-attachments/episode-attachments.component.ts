import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { LearnerMaterialsList } from '../../catalog/ui/learner-materials-list/learner-materials-list';

/**
 * The classroom's "Resources" tab: the teaching materials an instructor attached to the current episode (P4-03c). The list,
 * the download (a fresh signed storage URL per click) and every loading / error / empty state live in
 * `LearnerMaterialsList`; this tab only supplies the heading and which episode to show.
 */
@Component({
  selector: 'app-episode-attachments',
  imports: [TranslatePipe, LearnerMaterialsList],
  templateUrl: './episode-attachments.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EpisodeAttachmentsComponent {
  readonly episodeId = input<string | null>(null);
}
