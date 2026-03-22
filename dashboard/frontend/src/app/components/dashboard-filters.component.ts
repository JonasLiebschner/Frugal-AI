import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';

import type { SelectOption } from '../dashboard.types';

@Component({
  selector: 'app-dashboard-filters',
  standalone: true,
  imports: [CommonModule, FormsModule, SelectModule, MultiSelectModule],
  template: `
    <section class="grid gap-6 rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/75">
      <div class="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] xl:items-start">
        <div class="min-w-0 space-y-4">
          <div class="inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border border-[#bfe8d7] bg-[#eef8f3] px-4 py-2 text-sm text-[#2f7a6d] dark:border-[#3d6a60]/80 dark:bg-[#1f3836]/70 dark:text-[#9fe3d5]">
            <span class="text-base">🌱</span>
            <span>You saved {{ treesSaved() }} trees with Frugal AI</span>
          </div>

          <div class="space-y-3">
            <p class="text-sm font-semibold uppercase tracking-[0.28em] text-[#2f8f7f]/85 dark:text-[#7ad7c3]/85">
              Frugal AI Observatory
            </p>
            <h2 class="text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl dark:text-stone-100">
              Request and sustainability analytics
            </h2>
            <p class="max-w-3xl text-sm leading-6 text-stone-600 dark:text-slate-300">
              Track handled prompts, compare model behavior, and inspect power, CO2, water, cost, token, and latency trends without keeping the whole UI in one component.
            </p>
          </div>
        </div>

        <div class="grid min-w-0 gap-4 sm:grid-cols-2">
          <label class="grid min-w-0 gap-2 text-sm font-medium text-stone-700 dark:text-slate-200">
            <span>Comparison Model</span>
            <p-select
              [options]="modelOptions()"
              optionLabel="label"
              optionValue="value"
              [ngModel]="comparisonModel()"
              (ngModelChange)="comparisonModelChange.emit($event)"
              appendTo="body"
              styleClass="w-full min-w-0"
            />
          </label>

          <label class="grid min-w-0 gap-2 text-sm font-medium text-stone-700 dark:text-slate-200">
            <span>Routing Method</span>
            <p-multiselect
              [options]="routingOptions()"
              optionLabel="label"
              optionValue="value"
              [ngModel]="selectedRoutingMethods()"
              (ngModelChange)="selectedRoutingMethodsChange.emit($event)"
              display="chip"
              appendTo="body"
              styleClass="w-full min-w-0"
            />
          </label>

          <label class="grid min-w-0 gap-2 text-sm font-medium text-stone-700 dark:text-slate-200">
            <span>Start Time</span>
            <input
              type="datetime-local"
              class="h-11 w-full min-w-0 rounded-2xl border border-[#cfe2da] bg-[#f7fbf9] px-4 text-stone-900 outline-none transition focus:border-[#4fbf9f] dark:border-[#3a555d] dark:bg-[#1b2c31] dark:text-slate-100"
              [ngModel]="startDateTimeInput()"
              (ngModelChange)="startDateTimeInputChange.emit($event)"
            />
          </label>

          <label class="grid min-w-0 gap-2 text-sm font-medium text-stone-700 dark:text-slate-200">
            <span>End Time</span>
            <input
              type="datetime-local"
              class="h-11 w-full min-w-0 rounded-2xl border border-[#cfe2da] bg-[#f7fbf9] px-4 text-stone-900 outline-none transition focus:border-[#4fbf9f] dark:border-[#3a555d] dark:bg-[#1b2c31] dark:text-slate-100"
              [ngModel]="endDateTimeInput()"
              (ngModelChange)="endDateTimeInputChange.emit($event)"
            />
          </label>

        </div>
      </div>
    </section>
  `
})
export class DashboardFiltersComponent {
  readonly treesSaved = input.required<string>();
  readonly modelOptions = input.required<SelectOption[]>();
  readonly routingOptions = input.required<SelectOption[]>();
  readonly comparisonModel = input.required<string>();
  readonly selectedRoutingMethods = input.required<string[]>();
  readonly startDateTimeInput = input.required<string>();
  readonly endDateTimeInput = input.required<string>();

  readonly comparisonModelChange = output<string>();
  readonly selectedRoutingMethodsChange = output<string[]>();
  readonly startDateTimeInputChange = output<string>();
  readonly endDateTimeInputChange = output<string>();
}
