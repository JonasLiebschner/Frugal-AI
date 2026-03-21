import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { DashboardStore } from '../dashboard.store';
import { ChartsSectionComponent } from '../components/charts-section.component';
import { DashboardFiltersComponent } from '../components/dashboard-filters.component';
import { MetricsSectionComponent } from '../components/metrics-section.component';
import { RequestsTableComponent } from '../components/requests-table.component';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  host: {
    class: 'block w-full'
  },
  imports: [CommonModule, DashboardFiltersComponent, MetricsSectionComponent, RequestsTableComponent, ChartsSectionComponent],
  template: `
    <div class="flex w-full flex-col gap-6">
      <app-dashboard-filters
        [treesSaved]="store.formatTreesSaved(store.treesSaved())"
        [modelOptions]="store.modelOptions()"
        [routingOptions]="store.routingOptions()"
        [comparisonModel]="store.comparisonModel()"
        [selectedRoutingMethods]="store.selectedRoutingMethods()"
        [minimumUserScoreInput]="store.minimumUserScoreInput()"
        [timeZone]="store.timeZone()"
        [timeZoneOptions]="store.timeZoneOptions"
        [startDateTimeInput]="store.startDateTimeInput()"
        [endDateTimeInput]="store.endDateTimeInput()"
        (comparisonModelChange)="store.setComparisonModel($event)"
        (selectedRoutingMethodsChange)="store.setSelectedRoutingMethods($event)"
        (minimumUserScoreInputChange)="store.setMinimumUserScoreInput($event)"
        (timeZoneChange)="store.setTimeZone($event)"
        (startDateTimeInputChange)="store.setStartDateTimeInput($event)"
        (endDateTimeInputChange)="store.setEndDateTimeInput($event)"
      />

      @if (store.error()) {
        <section class="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300">
          {{ store.error() }}
        </section>
      }

      @if (store.loading()) {
        <section class="rounded-3xl border border-stone-200 bg-white/70 px-5 py-4 text-sm text-stone-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
          Loading dashboard data...
        </section>
      }

      <app-metrics-section [sustainabilityCards]="store.sustainabilityMetricCards()" [generalCards]="store.generalMetricCards()" />
      <app-requests-table [requests]="store.visibleRequests()" [comparisonModel]="store.comparisonModel()" />
      <app-charts-section [sections]="store.sustainabilityChartSections()" />
    </div>
  `
})
export class DashboardPageComponent {
  protected readonly store = inject(DashboardStore);
}
