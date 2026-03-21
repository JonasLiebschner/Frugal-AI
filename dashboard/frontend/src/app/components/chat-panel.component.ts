import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-chat-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <button
      type="button"
      class="fixed bottom-5 right-5 z-20 inline-flex items-center rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-orange-600 dark:bg-orange-500 dark:text-stone-950 dark:hover:bg-orange-400"
      (click)="toggle.emit()"
    >
      {{ open() ? 'Close Chat' : 'Open Chat' }}
    </button>

    @if (open()) {
      <section
        class="fixed bottom-20 right-5 z-20 w-[min(24rem,calc(100vw-2rem))] rounded-[1.75rem] border border-white/70 bg-white/95 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.18)] backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/95"
      >
        <div class="mb-4">
          <h3 class="text-lg font-semibold text-stone-900 dark:text-stone-100">Chat Window</h3>
          <p class="text-sm text-stone-500 dark:text-slate-400">Send a new request</p>
        </div>

        <textarea
          rows="6"
          class="min-h-36 w-full rounded-3xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-orange-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          [ngModel]="prompt()"
          (ngModelChange)="promptChange.emit($event)"
          placeholder="Type your next prompt here..."
        ></textarea>

        <button
          type="button"
          class="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
          [disabled]="!prompt().trim()"
          (click)="submit.emit()"
        >
          Submit Request
        </button>
      </section>
    }
  `
})
export class ChatPanelComponent {
  readonly open = input.required<boolean>();
  readonly prompt = input.required<string>();

  readonly toggle = output<void>();
  readonly promptChange = output<string>();
  readonly submit = output<void>();
}
