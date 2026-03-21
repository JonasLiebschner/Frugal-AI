import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-dashboard-header',
  standalone: true,
  template: `
    <header class="flex items-center justify-between gap-4">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.32em] text-orange-700/80">Frugal AI</p>
        <h1 class="mt-2 text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl dark:text-stone-100">
          Dashboard
        </h1>
      </div>

      <button
        type="button"
        class="inline-flex h-11 items-center rounded-full border border-stone-300 bg-white/80 px-2 text-stone-700 shadow-sm transition hover:border-orange-400 hover:text-orange-600 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-100 dark:hover:border-orange-400 dark:hover:text-orange-300"
        role="switch"
        [attr.aria-checked]="darkMode()"
        [attr.aria-label]="darkMode() ? 'Switch to light mode' : 'Switch to dark mode'"
        (click)="toggleTheme.emit()"
      >
        <span class="relative flex h-7 w-14 items-center rounded-full bg-orange-500/90 px-1 dark:bg-slate-800">
          <span
            class="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-white transition-opacity"
            [class.opacity-100]="!darkMode()"
            [class.opacity-40]="darkMode()"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 fill-none stroke-current stroke-2">
              <circle cx="12" cy="12" r="4"></circle>
              <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3"></path>
            </svg>
          </span>
          <span
            class="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-white transition-opacity"
            [class.opacity-100]="darkMode()"
            [class.opacity-40]="!darkMode()"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 fill-current">
              <path d="M20.2 14.1A8.5 8.5 0 0 1 9.9 3.8a9 9 0 1 0 10.3 10.3Z"></path>
            </svg>
          </span>
          <span
            class="absolute left-1 top-1 block h-5 w-5 rounded-full bg-white shadow-sm transition-transform"
            [class.translate-x-0]="!darkMode()"
            [class.translate-x-7]="darkMode()"
          ></span>
        </span>
      </button>
    </header>
  `
})
export class DashboardHeaderComponent {
  readonly darkMode = input.required<boolean>();
  readonly toggleTheme = output<void>();
}
