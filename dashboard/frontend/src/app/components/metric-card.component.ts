import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';

@Component({
  selector: 'app-metric-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <article class="rounded-[1.5rem] border border-white/70 bg-white/85 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.06)] dark:border-slate-800/80 dark:bg-slate-900/85">
      <p class="text-sm font-medium text-stone-500 dark:text-slate-400">{{ label() }}</p>
      <p class="mt-3 text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">{{ value() }}</p>
      @if (comparison()) {
        <p class="mt-2 text-sm text-stone-500 dark:text-slate-400">{{ comparison() }}</p>
      }
    </article>
  `
})
export class MetricCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly comparison = input<string>();
}
