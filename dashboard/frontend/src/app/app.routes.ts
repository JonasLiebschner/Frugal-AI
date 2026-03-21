import type { Routes } from '@angular/router';

import { ChatPageComponent } from './pages/chat-page.component';
import { DashboardPageComponent } from './pages/dashboard-page.component';

export const appRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'dashboard', component: DashboardPageComponent },
  { path: 'chat', component: ChatPageComponent },
  { path: '**', redirectTo: 'dashboard' }
];
