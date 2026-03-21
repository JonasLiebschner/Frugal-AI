import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';

import type { SustainabilityChartCard } from '../dashboard.types';

@Component({
  selector: 'app-charts-section',
  standalone: true,
  imports: [CommonModule, NgxEchartsDirective],
  template: `
    <section class="space-y-4 rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/75">
      <div class="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 class="text-lg font-semibold text-stone-900 dark:text-stone-100">Sustainability Charts</h3>
          <p class="text-sm text-stone-500 dark:text-slate-400">One chart per metric with all routing methods merged into series</p>
        </div>
      </div>

      @if (charts().length) {
        <div class="grid gap-4 xl:grid-cols-2">
          @for (chart of charts(); track chart.key) {
            <article
              class="rounded-[1.5rem] border border-stone-200/80 bg-stone-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/70"
            >
              <div class="mb-3">
                <h4 class="text-base font-semibold text-stone-900 dark:text-stone-100">{{ chart.title }}</h4>
                <p class="text-sm text-stone-500 dark:text-slate-400">{{ chart.subtitle }}</p>
              </div>
              <div echarts [options]="chart.options" class="h-[300px] w-full"></div>
            </article>
          }
        </div>
      } @else {
        <article class="rounded-[1.5rem] border border-dashed border-stone-300 bg-stone-50/70 p-8 text-sm text-stone-500 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-400">
          Select at least one routing method to view charts.
        </article>
      }
    </section>
  `
})
export class ChartsSectionComponent {
  readonly charts = input.required<SustainabilityChartCard[]>();
}
