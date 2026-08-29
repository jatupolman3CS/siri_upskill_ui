import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ToastHost } from './shared/toast/toast-host';
import { DevRoleSwitcher } from './shared/dev-role-switcher/dev-role-switcher';
import { RouteProgressBar } from './shared/route-progress-bar/route-progress-bar';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHost, DevRoleSwitcher, RouteProgressBar],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
