import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Params, Router } from '@angular/router';

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
        [timeZone]="store.timeZone()"
        [timeZoneOptions]="store.timeZoneOptions"
        [startDateTimeInput]="store.startDateTimeInput()"
        [endDateTimeInput]="store.endDateTimeInput()"
        (comparisonModelChange)="handleComparisonModelChange($event)"
        (selectedRoutingMethodsChange)="handleSelectedRoutingMethodsChange($event)"
        (timeZoneChange)="handleTimeZoneChange($event)"
        (startDateTimeInputChange)="handleStartDateTimeInputChange($event)"
        (endDateTimeInputChange)="handleEndDateTimeInputChange($event)"
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
      <app-charts-section [charts]="store.sustainabilityCharts()" />
    </div>
  `
})
export class DashboardPageComponent {
  protected readonly store = inject(DashboardStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private skipNextQuerySync = false;

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((queryParamMap) => {
        if (this.skipNextQuerySync) {
          this.skipNextQuerySync = false;
          return;
        }

        this.store.hydrateDashboardFilters({
          comparisonModel: queryParamMap.get('comparisonModel'),
          routingMethods: queryParamMap.getAll('routingMethod'),
          timeZone: queryParamMap.get('timeZone'),
          startDateTimeInput: queryParamMap.get('start'),
          endDateTimeInput: queryParamMap.get('end')
        });
      });
  }

  protected handleComparisonModelChange(value: string): void {
    this.store.setComparisonModel(value);
    void this.updateDashboardQueryParams();
  }

  protected handleSelectedRoutingMethodsChange(value: string[]): void {
    this.store.setSelectedRoutingMethods(value);
    void this.updateDashboardQueryParams();
  }

  protected handleTimeZoneChange(value: string): void {
    this.store.setTimeZone(value);
    void this.updateDashboardQueryParams();
  }

  protected handleStartDateTimeInputChange(value: string): void {
    this.store.setStartDateTimeInput(value);
    void this.updateDashboardQueryParams();
  }

  protected handleEndDateTimeInputChange(value: string): void {
    this.store.setEndDateTimeInput(value);
    void this.updateDashboardQueryParams();
  }

  private updateDashboardQueryParams(): Promise<boolean> {
    this.skipNextQuerySync = true;

    const queryParams: Params = {
      comparisonModel: this.store.comparisonModel(),
      routingMethod: this.store.selectedRoutingMethods().length > 0 ? this.store.selectedRoutingMethods() : null,
      timeZone: this.store.timeZone() || null,
      start: this.store.startDateTimeInput() || null,
      end: this.store.endDateTimeInput() || null
    };

    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      replaceUrl: true
    });
  }
}
