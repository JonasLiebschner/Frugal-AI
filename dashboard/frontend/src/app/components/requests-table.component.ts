import { Component, input } from '@angular/core';
import { TableModule } from 'primeng/table';

import { formatCost, formatDuration, formatScore, formatTimestamp, formatWater, modelDelta } from '../dashboard-formatters';
import type { AiRequest } from '../dashboard.types';

@Component({
  selector: 'app-requests-table',
  standalone: true,
  imports: [TableModule],
  template: `
    <section class="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/75">
      <div class="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 class="text-lg font-semibold text-stone-900 dark:text-stone-100">Handled Requests</h3>
          <p class="text-sm text-stone-500 dark:text-slate-400">Filtered by selected routing methods</p>
        </div>
      </div>

      <div class="overflow-x-auto rounded-[1.5rem] border border-stone-200/80 bg-stone-50/70 dark:border-sky-950/80 dark:bg-[#0b1225]/80">
        <p-table
          [value]="requests()"
          [tableStyle]="{ 'min-width': '1020px' }"
          [paginator]="true"
          [rows]="20"
          [showCurrentPageReport]="true"
          currentPageReportTemplate="Showing {first} to {last} of {totalRecords} requests"
          styleClass="requests-table"
          size="small"
          sortMode="multiple"
        >
          <ng-template pTemplate="header">
            <tr>
              <th pSortableColumn="prompt">Request <p-sortIcon field="prompt" /></th>
              <th pSortableColumn="model">Model <p-sortIcon field="model" /></th>
              <th pSortableColumn="routingMethod">Routing <p-sortIcon field="routingMethod" /></th>
              <th pSortableColumn="routingOutcome">Outcome <p-sortIcon field="routingOutcome" /></th>
              <th pSortableColumn="powerWh">Power <p-sortIcon field="powerWh" /></th>
              <th pSortableColumn="co2">CO2 <p-sortIcon field="co2" /></th>
              <th pSortableColumn="waterMl">Water <p-sortIcon field="waterMl" /></th>
              <th pSortableColumn="inputTokens">Input <p-sortIcon field="inputTokens" /></th>
              <th pSortableColumn="outputTokens">Output <p-sortIcon field="outputTokens" /></th>
              <th pSortableColumn="durationMs">Duration <p-sortIcon field="durationMs" /></th>
              <th pSortableColumn="costUsd">Cost <p-sortIcon field="costUsd" /></th>
              <th pSortableColumn="validationScore">Validation <p-sortIcon field="validationScore" /></th>
              <th pSortableColumn="createdAt">Time <p-sortIcon field="createdAt" /></th>
            </tr>
          </ng-template>

          <ng-template pTemplate="body" let-req>
            <tr>
              <td>
                <p class="m-0 max-w-[28rem] truncate font-medium text-stone-800 dark:text-stone-100" [attr.title]="req.prompt">
                  {{ getPromptPreview(req.prompt) }}
                </p>
                <p class="mt-1 font-mono text-xs text-orange-700 dark:text-orange-300">
                  {{ getModelDelta(req) }}
                </p>
              </td>
              <td>{{ req.model }}</td>
              <td>{{ req.routingMethod }}</td>
              <td>{{ req.routingOutcome ?? '' }}</td>
              <td>{{ req.powerWh.toFixed(1) }} Wh</td>
              <td>{{ req.co2.toFixed(1) }} g</td>
              <td>{{ getWater(req.waterMl) }}</td>
              <td>{{ req.inputTokens }}</td>
              <td>{{ req.outputTokens }}</td>
              <td>{{ getDuration(req.durationMs) }}</td>
              <td>{{ getCost(req.costUsd) }}</td>
              <td>{{ getScore(req.validationScore) }}</td>
              <td>{{ getTimestamp(req.createdAt) }}</td>
            </tr>
          </ng-template>

          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="13" class="!py-10 text-center">
                <div class="space-y-2">
                  <p class="text-sm font-medium text-stone-700 dark:text-slate-200">No handled requests found.</p>
                  <p class="text-sm text-stone-500 dark:text-slate-400">
                    Adjust the filters or submit a new request to populate this table.
                  </p>
                </div>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    </section>
  `
})
export class RequestsTableComponent {
  readonly requests = input.required<AiRequest[]>();
  readonly comparisonModel = input.required<string>();

  protected getTimestamp = formatTimestamp;
  protected getDuration = formatDuration;
  protected getCost = formatCost;
  protected getWater = formatWater;
  protected getScore = formatScore;

  protected getModelDelta(request: AiRequest): string {
    return modelDelta(request, this.comparisonModel());
  }

  protected getPromptPreview(prompt: string): string {
    const normalized = prompt.replace(/\s+/g, ' ').trim();
    if (normalized.length <= 120) {
      return normalized;
    }

    return `${normalized.slice(0, 117)}...`;
  }
}
