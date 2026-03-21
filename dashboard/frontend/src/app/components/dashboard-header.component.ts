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
        <span class="mr-3 text-sm font-medium">{{ darkMode() ? 'Dark' : 'Light' }}</span>
        <span class="relative block h-7 w-14 rounded-full bg-stone-200 dark:bg-slate-700">
          <span
            class="absolute top-1 block h-5 w-5 rounded-full bg-orange-500 transition-transform"
            [class.translate-x-1]="!darkMode()"
            [class.translate-x-8]="darkMode()"
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
