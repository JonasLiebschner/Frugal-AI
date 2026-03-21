import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';

import { DashboardStore } from '../dashboard.store';

@Component({
  selector: 'app-chat-page',
  standalone: true,
  host: {
    class: 'block w-full'
  },
  imports: [CommonModule, FormsModule, SelectModule],
  template: `
    <div class="flex w-full flex-col gap-4">
      <section class="grid gap-4 xl:grid-cols-[17rem_minmax(0,1fr)]">
        <aside class="rounded-[2rem] border border-white/70 bg-white/75 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur dark:border-sky-900/60 dark:bg-[linear-gradient(180deg,rgba(6,18,38,0.96),rgba(8,15,28,0.94))] dark:shadow-[0_28px_90px_rgba(2,6,23,0.55)]">
          <p class="text-sm font-semibold uppercase tracking-[0.28em] text-orange-700/75 dark:text-sky-300/80">Workspace</p>
          <h2 class="mt-3 text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Chat</h2>
          <p class="mt-3 text-sm leading-6 text-stone-600 dark:text-slate-300/90">
            Send one request at a time directly from the frontend. Auto mode uses the routing method you choose here; fixed models bypass routing.
          </p>

          <div class="mt-5 grid gap-3">
            <article class="rounded-[1.5rem] border border-stone-200/80 bg-stone-50/80 p-4 dark:border-sky-950/80 dark:bg-slate-950/75 dark:shadow-[inset_0_1px_0_rgba(125,211,252,0.08)]">
              <p class="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500 dark:text-sky-200/55">Selected Model</p>
              <p class="mt-2 text-lg font-semibold text-stone-900 dark:text-stone-100">
                {{ store.chatSelectedModel() === 'auto' ? 'Auto' : store.chatSelectedModel() }}
              </p>
            </article>

            <article class="rounded-[1.5rem] border border-stone-200/80 bg-stone-50/80 p-4 dark:border-sky-950/80 dark:bg-slate-950/75 dark:shadow-[inset_0_1px_0_rgba(125,211,252,0.08)]">
              <p class="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500 dark:text-sky-200/55">Routing Method</p>
              <p class="mt-2 text-sm text-stone-700 dark:text-slate-200">
                {{ store.canSelectChatRoutingMethod() ? store.chatSelectedRoutingMethod() : 'Disabled for fixed model' }}
              </p>
            </article>

            <article class="rounded-[1.5rem] border border-stone-200/80 bg-stone-50/80 p-4 dark:border-sky-950/80 dark:bg-slate-950/75 dark:shadow-[inset_0_1px_0_rgba(125,211,252,0.08)]">
              <p class="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500 dark:text-sky-200/55">Request Mode</p>
              <p class="mt-2 text-lg font-semibold text-stone-900 dark:text-stone-100">Single request</p>
            </article>
          </div>
        </aside>

        <section class="flex min-h-[38rem] flex-col rounded-[2rem] border border-white/70 bg-white/80 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur dark:border-sky-900/50 dark:bg-[radial-gradient(circle_at_top,rgba(15,23,42,0.98),rgba(6,12,24,0.97)_62%)] dark:shadow-[0_28px_90px_rgba(2,6,23,0.62)] sm:p-5">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 class="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Chat</h3>
              <p class="mt-2 text-sm text-stone-500 dark:text-slate-300/80">A focused request view with a compact composer and the latest response.</p>
            </div>
          </div>

          <div class="mt-5 grid gap-3">
            <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <label class="grid min-w-0 gap-2 text-sm font-medium text-stone-700 dark:text-slate-200">
                <span>Model</span>
                <p-select
                  [options]="store.chatModelOptions()"
                  optionLabel="label"
                  optionValue="value"
                  [ngModel]="store.chatSelectedModel()"
                  (ngModelChange)="store.setChatSelectedModel($event)"
                  appendTo="body"
                  styleClass="w-full min-w-0"
                />
              </label>

              <label class="grid min-w-0 gap-2 text-sm font-medium text-stone-700 dark:text-slate-200">
                <span>Routing Method</span>
                <p-select
                  [options]="store.routingOptions()"
                  optionLabel="label"
                  optionValue="value"
                  [ngModel]="store.chatSelectedRoutingMethod()"
                  (ngModelChange)="store.setChatSelectedRoutingMethod($event)"
                  [disabled]="!store.canSelectChatRoutingMethod()"
                  appendTo="body"
                  styleClass="w-full min-w-0"
                />
              </label>

              <div class="rounded-[1.25rem] border border-dashed border-stone-300/80 px-4 py-3 text-sm text-stone-500 dark:border-sky-900/60 dark:bg-slate-950/45 dark:text-sky-100/65">
                {{ store.canSelectChatRoutingMethod() ? 'Auto mode uses the selected routing method.' : 'Fixed model mode is direct.' }}
              </div>
            </div>

            <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-stone-200/80 bg-stone-50/70 dark:border-sky-950/70 dark:bg-[linear-gradient(180deg,rgba(10,18,34,0.92),rgba(6,10,20,0.96))]">
              <div class="border-b border-stone-200/80 px-4 py-3 dark:border-sky-950/70 dark:bg-slate-950/35">
                <p class="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500 dark:text-sky-200/60">Latest response</p>
              </div>

              @if (store.chatMessages().length) {
                <div class="grid max-h-[20rem] gap-3 overflow-y-auto px-4 py-4">
                  @for (message of store.chatMessages(); track $index) {
                    <article
                      class="max-w-[85%] rounded-[1.5rem] border px-4 py-3 text-sm leading-6 shadow-sm transition-colors"
                      [ngClass]="message.role === 'assistant'
                        ? 'justify-self-start border-stone-200 bg-white text-stone-900 dark:border-sky-950 dark:bg-slate-900/95 dark:text-slate-100'
                        : 'justify-self-end border-orange-500 bg-orange-500 text-white dark:border-orange-400/30 dark:bg-orange-600'"
                    >
                      <p class="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.2em] opacity-70">{{ message.role }}</p>
                      <p class="whitespace-pre-wrap">{{ message.content }}</p>
                    </article>
                  }
                </div>
              } @else {
                <div class="flex min-h-[12rem] flex-1 items-center justify-center px-6 py-8">
                  <div class="max-w-md text-center">
                    <p class="text-sm font-semibold uppercase tracking-[0.24em] text-stone-500 dark:text-sky-200/60">Start Chatting</p>
                    <p class="mt-3 text-sm leading-6 text-stone-500 dark:text-slate-300/72">
                      Choose Auto to use routing or select a fixed model, then send a prompt below. Each send creates a new standalone request.
                    </p>
                  </div>
                </div>
              }
            </div>

            <div class="rounded-[1.75rem] border border-stone-200/80 bg-white/80 p-3 dark:border-sky-950/70 dark:bg-[linear-gradient(180deg,rgba(9,16,30,0.94),rgba(5,11,22,0.96))]">
              <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
                <textarea
                  rows="2"
                  class="min-h-[4.25rem] flex-1 resize-none rounded-[1.25rem] border border-stone-300 bg-stone-100 px-4 py-3 text-sm leading-6 text-stone-900 outline-none transition focus:border-orange-400 dark:border-sky-800/70 dark:bg-slate-800/90 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:border-teal-400 dark:focus:ring-2 dark:focus:ring-teal-500/20"
                  [ngModel]="store.chatPrompt()"
                  (ngModelChange)="store.chatPrompt.set($event)"
                  (keydown)="handleComposerKeydown($event)"
                  placeholder="Message OpenAI..."
                ></textarea>

                <div class="flex items-center justify-between gap-3 sm:flex-col sm:items-stretch">
                  <button
                    type="button"
                    class="inline-flex items-center justify-center rounded-2xl border border-stone-300 px-4 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-950 dark:bg-slate-950/88 dark:text-slate-200 dark:hover:border-sky-800 dark:hover:bg-slate-900"
                    [disabled]="!store.chatMessages().length && !store.chatPrompt().trim()"
                    (click)="store.clearChat()"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    class="inline-flex items-center justify-center rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 dark:bg-[linear-gradient(135deg,rgba(99,102,241,0.96),rgba(37,99,235,0.94))] dark:text-white dark:hover:bg-[linear-gradient(135deg,rgba(129,140,248,0.96),rgba(59,130,246,0.94))] dark:disabled:border dark:disabled:border-slate-700 dark:disabled:bg-slate-900 dark:disabled:text-slate-400"
                    [disabled]="!store.chatPrompt().trim() || store.chatSubmitting()"
                    (click)="store.sendPrompt()"
                  >
                    {{ store.chatSubmitting() ? 'Sending...' : 'Send' }}
                  </button>
                </div>
              </div>

              <div class="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
                <p class="text-xs text-stone-500 dark:text-slate-400/90">Press Enter to send, Shift+Enter for a new line.</p>
                <p class="text-xs text-stone-500 dark:text-slate-400/90">
                  {{ store.canSelectChatRoutingMethod() ? 'Each request uses the selected routing method.' : 'Routing is disabled for fixed models.' }}
                </p>
              </div>
            </div>
          </div>
        </section>
      </section>
    </div>
  `
})
export class ChatPageComponent {
  protected readonly store = inject(DashboardStore);

  protected handleComposerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void this.store.sendPrompt();
  }
}
