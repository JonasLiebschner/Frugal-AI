import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { DashboardStore } from '../dashboard.store';

@Component({
  selector: 'app-chat-page',
  standalone: true,
  host: {
    class: 'block w-full'
  },
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex w-full flex-col gap-6">
      <section class="grid gap-6 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
        <aside class="rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/75">
          <p class="text-sm font-semibold uppercase tracking-[0.28em] text-orange-700/75 dark:text-orange-300/75">Workspace</p>
          <h2 class="mt-3 text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Chat</h2>
          <p class="mt-3 text-sm leading-6 text-stone-600 dark:text-slate-300">
            Send a request in its own workspace instead of the old floating widget. The currently selected comparison model and routing settings are reused from the dashboard.
          </p>

          <div class="mt-6 grid gap-4">
            <article class="rounded-[1.5rem] border border-stone-200/80 bg-stone-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <p class="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500 dark:text-slate-400">Comparison Model</p>
              <p class="mt-2 text-lg font-semibold text-stone-900 dark:text-stone-100">{{ store.comparisonModel() }}</p>
            </article>
            <article class="rounded-[1.5rem] border border-stone-200/80 bg-stone-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <p class="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500 dark:text-slate-400">Routing Methods</p>
              <p class="mt-2 text-sm text-stone-700 dark:text-slate-200">
                {{ store.selectedRoutingMethods().length ? store.selectedRoutingMethods().join(', ') : 'No routing filter selected' }}
              </p>
            </article>
            <article class="rounded-[1.5rem] border border-stone-200/80 bg-stone-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/70">
              <p class="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500 dark:text-slate-400">Recent Requests</p>
              <p class="mt-2 text-lg font-semibold text-stone-900 dark:text-stone-100">{{ store.visibleRequests().length }}</p>
            </article>
          </div>
        </aside>

        <section class="rounded-[2rem] border border-white/70 bg-white/80 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/78">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 class="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">New Request</h3>
              <p class="mt-2 text-sm text-stone-500 dark:text-slate-400">Write a prompt and send it to the backend from this dedicated chat page.</p>
            </div>
            <div class="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
              {{ store.formatTreesSaved(store.treesSaved()) }} trees saved
            </div>
          </div>

          @if (store.error()) {
            <section class="mt-6 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300">
              {{ store.error() }}
            </section>
          }

          <div class="mt-6 grid gap-4">
            <textarea
              rows="12"
              class="min-h-[22rem] w-full rounded-[2rem] border border-stone-300 bg-stone-50 px-5 py-4 text-sm leading-6 text-stone-900 outline-none transition focus:border-orange-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              [ngModel]="store.chatPrompt()"
              (ngModelChange)="store.chatPrompt.set($event)"
              placeholder="Type your next prompt here..."
            ></textarea>

            <div class="flex flex-wrap items-center justify-between gap-3">
              <p class="text-sm text-stone-500 dark:text-slate-400">
                The submitted request refreshes the dashboard data after completion.
              </p>
              <button
                type="button"
                class="inline-flex items-center justify-center rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                [disabled]="!store.chatPrompt().trim()"
                (click)="store.sendPrompt()"
              >
                Submit Request
              </button>
            </div>
          </div>
        </section>
      </section>
    </div>
  `
})
export class ChatPageComponent {
  protected readonly store = inject(DashboardStore);
}
