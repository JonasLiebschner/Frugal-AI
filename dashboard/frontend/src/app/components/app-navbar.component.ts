import { Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <header class="flex flex-col gap-4 rounded-[2rem] border border-white/70 bg-white/70 p-4 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/70 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.32em] text-orange-700/80">Frugal AI</p>
        <h1 class="mt-2 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Control Center</h1>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <nav class="flex items-center rounded-full border border-stone-200 bg-stone-100/80 p-1 dark:border-slate-700 dark:bg-slate-950/80">
          <a
            routerLink="/dashboard"
            routerLinkActive="bg-white text-stone-900 shadow-sm dark:bg-slate-800 dark:text-white"
            class="rounded-full px-4 py-2 text-sm font-medium text-stone-600 transition dark:text-slate-300"
          >
            Dashboard
          </a>
          <a
            routerLink="/chat"
            routerLinkActive="bg-white text-stone-900 shadow-sm dark:bg-slate-800 dark:text-white"
            class="rounded-full px-4 py-2 text-sm font-medium text-stone-600 transition dark:text-slate-300"
          >
            Chat
          </a>
        </nav>

        <button
          type="button"
          class="inline-flex h-11 items-center rounded-full border border-stone-300 bg-white/80 px-2 text-stone-700 shadow-sm transition hover:border-orange-400 hover:text-orange-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100"
          role="switch"
          [attr.aria-checked]="darkMode()"
          [attr.aria-label]="darkMode() ? 'Switch to light mode' : 'Switch to dark mode'"
          (click)="toggleTheme.emit()"
        >
          <span class="relative flex h-7 w-14 items-center rounded-full bg-orange-500/90 px-1 dark:bg-slate-800">
            <span class="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-white transition-opacity" [class.opacity-100]="!darkMode()" [class.opacity-40]="darkMode()" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 fill-none stroke-current stroke-2">
                <circle cx="12" cy="12" r="4"></circle>
                <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3"></path>
              </svg>
            </span>
            <span class="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-white transition-opacity" [class.opacity-100]="darkMode()" [class.opacity-40]="!darkMode()" aria-hidden="true">
              <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 fill-current">
                <path d="M20.2 14.1A8.5 8.5 0 0 1 9.9 3.8a9 9 0 1 0 10.3 10.3Z"></path>
              </svg>
            </span>
            <span class="absolute left-1 top-1 block h-5 w-5 rounded-full bg-white shadow-sm transition-transform" [class.translate-x-0]="!darkMode()" [class.translate-x-7]="darkMode()"></span>
          </span>
        </button>
      </div>
    </header>
  `
})
export class AppNavbarComponent {
  readonly darkMode = input.required<boolean>();
  readonly toggleTheme = output<void>();
}
