import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AmbientBackground } from './shared/ambient-background/ambient-background';
import { ToastHost } from './shared/toast/toast-host';
import { RouteProgressBar } from './shared/route-progress-bar/route-progress-bar';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHost, RouteProgressBar, AmbientBackground],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
