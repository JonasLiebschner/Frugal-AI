import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';

import type { MetricSummaryCard } from '../dashboard.types';
import { MetricCardComponent } from './metric-card.component';

@Component({
  selector: 'app-metrics-section',
  standalone: true,
  imports: [CommonModule, MetricCardComponent],
  template: `
    <section class="grid gap-5 xl:grid-cols-2">
      <article class="flex h-full flex-col gap-4 rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/75">
        <div class="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 class="text-lg font-semibold text-stone-900 dark:text-stone-100">Sustainability Metrics</h3>
            <p class="text-sm text-stone-500 dark:text-slate-400">Resource consumption totals</p>
          </div>
        </div>
        <div class="grid flex-1 gap-4 sm:grid-cols-2">
          @for (card of sustainabilityCards(); track card.label) {
            <app-metric-card
              [label]="card.label"
              [value]="card.value"
              [comparison]="card.comparison"
            />
          }
        </div>
      </article>

      <article class="flex h-full flex-col gap-4 rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/75">
        <div class="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 class="text-lg font-semibold text-stone-900 dark:text-stone-100">General Metrics</h3>
            <p class="text-sm text-stone-500 dark:text-slate-400">Request and quality overview</p>
          </div>
        </div>
        <div class="grid flex-1 gap-4 sm:grid-cols-2">
          @for (card of generalCards(); track card.label) {
            <app-metric-card
              [label]="card.label"
              [value]="card.value"
              [comparison]="card.comparison"
            />
          }
        </div>
      </article>
    </section>
  `
})
export class MetricsSectionComponent {
  readonly sustainabilityCards = input.required<MetricSummaryCard[]>();
  readonly generalCards = input.required<MetricSummaryCard[]>();
}
