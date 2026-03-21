import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';

import { DashboardStore } from './dashboard.store';
import { AppNavbarComponent } from './components/app-navbar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, AppNavbarComponent, ToastModule],
  templateUrl: './app.component.html'
})
export class AppComponent {
  protected readonly store = inject(DashboardStore);
}
