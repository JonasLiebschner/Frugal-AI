import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { EChartsOption } from 'echarts';
import { NgxEchartsDirective } from 'ngx-echarts';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TextareaModule } from 'primeng/textarea';

type RoutingMethod = 'round-robin' | 'latency-first' | 'cost-optimized';
type SustainabilityMetricKey = 'powerWh' | 'co2g' | 'waterMl' | 'costUsd';

type RequestLog = {
  id: string;
  model: string;
  comparisonModel: string;
  routingMethod: RoutingMethod;
  prompt: string;
  powerWh: number;
  co2g: number;
  waterMl: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  costUsd: number;
  validationScore: number;
  createdAt: string;
};

type SustainabilityChartCard = {
  key: string;
  title: string;
  subtitle: string;
  options: EChartsOption;
};

type RoutingMethodChartSection = {
  routingMethod: RoutingMethod;
  charts: SustainabilityChartCard[];
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, NgxEchartsDirective, ButtonModule, CardModule, SelectModule, MultiSelectModule, TableModule, TextareaModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  private readonly darkModeStorageKey = 'frugal-ai-dashboard.darkMode';
  private readonly modelEfficiency: Record<string, { power: number; co2: number; water: number; cost: number }> = {
    'gpt-4.1-mini': { power: 1.0, co2: 1.0, water: 1.0, cost: 1.0 },
    'gpt-4.1': { power: 1.55, co2: 1.52, water: 1.45, cost: 3.2 },
    'gpt-4o-mini': { power: 1.12, co2: 1.1, water: 1.08, cost: 1.35 },
    'claude-3.7-sonnet': { power: 1.42, co2: 1.38, water: 1.33, cost: 2.8 },
    'llama-3.3-70b': { power: 1.9, co2: 1.86, water: 1.75, cost: 1.9 }
  };
  private readonly sustainabilityMetrics: Array<{ key: SustainabilityMetricKey; label: string; color: string }> = [
    { key: 'powerWh', label: 'Power (Wh)', color: '#f05d23' },
    { key: 'co2g', label: 'CO2 (g)', color: '#2b7fff' },
    { key: 'waterMl', label: 'Water (ml)', color: '#18a46c' },
    { key: 'costUsd', label: 'Cost ($)', color: '#b256d9' }
  ];

  protected readonly models = ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'claude-3.7-sonnet', 'llama-3.3-70b'];
  protected readonly routingMethods: RoutingMethod[] = ['round-robin', 'latency-first', 'cost-optimized'];

  protected readonly modelOptions = this.models.map((model) => ({ label: model, value: model }));
  protected readonly routingOptions = this.routingMethods.map((routingMethod) => ({ label: routingMethod, value: routingMethod }));

  protected readonly comparisonModel = signal<string>('gpt-4.1');
  protected readonly selectedRoutingMethods = signal<RoutingMethod[]>([...this.routingMethods]);
  protected readonly minimumUserScoreInput = signal<string>('0');
  protected readonly chatPrompt = signal<string>('');
  protected readonly chatOpen = signal<boolean>(false);
  protected readonly darkMode = signal<boolean>(false);

  private readonly requests = signal<RequestLog[]>([
    {
      id: 'REQ-5001',
      model: 'gpt-4.1-mini',
      comparisonModel: 'gpt-4.1',
      routingMethod: 'round-robin',
      prompt: 'Summarize vendor invoices',
      powerWh: 2.2,
      co2g: 1.1,
      waterMl: 16,
      inputTokens: 68,
      outputTokens: 104,
      durationMs: 1850,
      costUsd: 0.0005,
      validationScore: 4.4,
      createdAt: '2026-03-20T08:05:00Z'
    },
    {
      id: 'REQ-5002',
      model: 'claude-3.7-sonnet',
      comparisonModel: 'gpt-4.1',
      routingMethod: 'latency-first',
      prompt: 'Create sprint release notes',
      powerWh: 2.8,
      co2g: 1.5,
      waterMl: 19,
      inputTokens: 87,
      outputTokens: 136,
      durationMs: 2460,
      costUsd: 0.0007,
      validationScore: 4.1,
      createdAt: '2026-03-20T08:40:00Z'
    },
    {
      id: 'REQ-5003',
      model: 'gpt-4o-mini',
      comparisonModel: 'gpt-4.1',
      routingMethod: 'cost-optimized',
      prompt: 'Draft customer response email',
      powerWh: 1.6,
      co2g: 0.8,
      waterMl: 11,
      inputTokens: 54,
      outputTokens: 89,
      durationMs: 1410,
      costUsd: 0.0004,
      validationScore: 4.6,
      createdAt: '2026-03-20T09:12:00Z'
    },
    {
      id: 'REQ-5004',
      model: 'llama-3.3-70b',
      comparisonModel: 'gpt-4.1',
      routingMethod: 'latency-first',
      prompt: 'Explain churn trend by region',
      powerWh: 3.7,
      co2g: 2.1,
      waterMl: 26,
      inputTokens: 118,
      outputTokens: 177,
      durationMs: 3120,
      costUsd: 0.001,
      validationScore: 3.9,
      createdAt: '2026-03-20T10:21:00Z'
    },
    {
      id: 'REQ-5005',
      model: 'gpt-4.1-mini',
      comparisonModel: 'gpt-4.1',
      routingMethod: 'round-robin',
      prompt: 'Refactor SQL query',
      powerWh: 2.0,
      co2g: 1.0,
      waterMl: 14,
      inputTokens: 62,
      outputTokens: 93,
      durationMs: 1680,
      costUsd: 0.0005,
      validationScore: 4.3,
      createdAt: '2026-03-20T11:37:00Z'
    }
  ]);

  public constructor() {
    if (typeof window === 'undefined') {
      return;
    }

    const persisted = window.localStorage.getItem(this.darkModeStorageKey);
    if (persisted === 'true' || persisted === 'false') {
      this.setDarkMode(persisted === 'true');
    } else {
      this.setDarkMode(false);
    }
  }

  protected readonly minimumUserScore = computed<number>(() => {
    const normalized = this.minimumUserScoreInput().replace(',', '.').trim();
    const parsed = Number(normalized);
    if (Number.isNaN(parsed)) {
      return 0;
    }
    const clamped = Math.min(5, Math.max(0, parsed));
    return Number(clamped.toFixed(1));
  });

  protected readonly visibleRequests = computed(() => {
    const selectedRoutingMethods = this.selectedRoutingMethods();
    if (!selectedRoutingMethods.length) {
      return [];
    }
    return this.requests().filter((item) => selectedRoutingMethods.includes(item.routingMethod) && item.validationScore >= this.minimumUserScore());
  });

  protected readonly totalPowerWh = computed(() => this.visibleRequests().reduce((acc, item) => acc + item.powerWh, 0));
  protected readonly totalCo2g = computed(() => this.visibleRequests().reduce((acc, item) => acc + item.co2g, 0));
  protected readonly totalWaterMl = computed(() => this.visibleRequests().reduce((acc, item) => acc + item.waterMl, 0));
  protected readonly totalInputTokens = computed(() => this.visibleRequests().reduce((acc, item) => acc + item.inputTokens, 0));
  protected readonly totalOutputTokens = computed(() => this.visibleRequests().reduce((acc, item) => acc + item.outputTokens, 0));
  protected readonly totalCostUsd = computed(() => this.visibleRequests().reduce((acc, item) => acc + item.costUsd, 0));
  protected readonly avgValidationScore = computed(() => {
    const items = this.visibleRequests();
    if (!items.length) {
      return 0;
    }
    return items.reduce((acc, item) => acc + item.validationScore, 0) / items.length;
  });
  protected readonly avgDurationMs = computed(() => {
    const items = this.visibleRequests();
    if (!items.length) {
      return 0;
    }
    return items.reduce((acc, item) => acc + item.durationMs, 0) / items.length;
  });

  protected readonly sustainabilityChartSections = computed<RoutingMethodChartSection[]>(() => {
    const comparisonModel = this.comparisonModel();
    const selectedRoutingMethods = this.selectedRoutingMethods();
    const isDark = this.darkMode();
    const all = this.visibleRequests();

    const sections: RoutingMethodChartSection[] = [];

    for (const routingMethod of selectedRoutingMethods) {
      const points = all
        .filter((req) => req.routingMethod === routingMethod)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      const labels = points.map((req) => req.id);
      const estimated = points.map((req) => this.estimateComparisonMetric(req, comparisonModel));
      const charts: SustainabilityChartCard[] = [];

      for (const metric of this.sustainabilityMetrics) {
        charts.push({
          key: `${routingMethod}-${metric.key}`,
          title: metric.label,
          subtitle: `Actual vs ${comparisonModel}`,
          options: {
            tooltip: { trigger: 'axis' },
            legend: {
              top: 4,
              textStyle: { color: isDark ? '#c4d1df' : '#56544f' }
            },
            grid: { left: 24, right: 18, top: 42, bottom: 22, containLabel: true },
            xAxis: {
              type: 'category',
              axisTick: { show: false },
              axisLine: { lineStyle: { color: isDark ? '#5f7288' : '#b7b0a2' } },
              axisLabel: { color: isDark ? '#c4d1df' : '#56544f' },
              data: labels
            },
            yAxis: {
              type: 'value',
              axisLabel: { color: isDark ? '#c4d1df' : '#56544f' },
              splitLine: { lineStyle: { color: isDark ? '#374859' : '#dfd7c8' } }
            },
            series: [
              {
                type: 'line',
                smooth: true,
                symbol: 'circle',
                symbolSize: 6,
                name: `${metric.label} Actual`,
                itemStyle: { color: metric.color },
                lineStyle: { color: metric.color, width: 2 },
                data: points.map((req) => req[metric.key])
              },
              {
                type: 'line',
                smooth: true,
                symbol: 'circle',
                symbolSize: 6,
                name: `${metric.label} Comparison`,
                itemStyle: { color: metric.color },
                lineStyle: { color: metric.color, width: 2, type: 'dashed' },
                data: estimated.map((item) => item[metric.key])
              }
            ]
          }
        });
      }

      sections.push({
        routingMethod,
        charts
      });
    }

    return sections;
  });

  protected sendPrompt(): void {
    const text = this.chatPrompt().trim();

    if (!text) {
      return;
    }

    const created = new Date();
    const requestModel = 'gpt-4.1-mini';
    const routingMethod = this.selectedRoutingMethods()[0] ?? this.routingMethods[0];
    const isLight = requestModel.includes('mini');
    const inputTokens = Math.max(20, Math.round(text.length * 1.15));
    const outputTokens = Math.round((Math.max(20, text.length) * (isLight ? 1.6 : 2.1)) + Math.random() * 30);
    const next: RequestLog = {
      id: `REQ-${5000 + this.requests().length + 1}`,
      model: requestModel,
      comparisonModel: this.comparisonModel(),
      routingMethod,
      prompt: text,
      powerWh: Number((isLight ? 1.3 : 2.6 + Math.random()).toFixed(1)),
      co2g: Number((isLight ? 0.7 : 1.4 + Math.random()).toFixed(1)),
      waterMl: Math.round(isLight ? 10 + Math.random() * 6 : 16 + Math.random() * 10),
      inputTokens,
      outputTokens,
      durationMs: Math.round((isLight ? 1200 : 2100) + Math.random() * 1800),
      costUsd: Number((((inputTokens / 1_000_000) * 0.15) + ((outputTokens / 1_000_000) * 0.6)).toFixed(6)),
      validationScore: Number((isLight ? 4.2 + Math.random() * 0.6 : 3.6 + Math.random() * 0.9).toFixed(1)),
      createdAt: created.toISOString()
    };

    this.requests.update((old) => [next, ...old]);
    this.chatPrompt.set('');
  }

  protected toggleChat(): void {
    this.chatOpen.update((open) => !open);
  }

  protected setDarkMode(enabled: boolean): void {
    this.darkMode.set(enabled);
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('app-dark', enabled);
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(this.darkModeStorageKey, String(enabled));
    }
  }

  protected setMinimumUserScoreInput(value: unknown): void {
    this.minimumUserScoreInput.set(String(value ?? ''));
  }

  protected formatTimestamp(iso: string): string {
    return new Date(iso).toLocaleString([], { hour12: false, month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  protected formatDuration(durationMs: number): string {
    return `${(durationMs / 1000).toFixed(2)} s`;
  }

  protected formatCost(costUsd: number): string {
    return `$${costUsd.toFixed(4)}`;
  }

  protected formatScore(score: number): string {
    return `${score.toFixed(1)} / 5`;
  }

  private estimateComparisonMetric(req: RequestLog, comparisonModel: string): Pick<RequestLog, SustainabilityMetricKey> {
    const baseline = this.modelEfficiency['gpt-4.1-mini'];
    const current = this.modelEfficiency[req.model] ?? baseline;
    const comparison = this.modelEfficiency[comparisonModel] ?? baseline;

    return {
      powerWh: Number((req.powerWh * (comparison.power / current.power)).toFixed(3)),
      co2g: Number((req.co2g * (comparison.co2 / current.co2)).toFixed(3)),
      waterMl: Number((req.waterMl * (comparison.water / current.water)).toFixed(3)),
      costUsd: Number((req.costUsd * (comparison.cost / current.cost)).toFixed(6))
    };
  }

  protected modelDelta(request: RequestLog): string {
    return request.model === request.comparisonModel ? 'same' : `${request.model} vs ${request.comparisonModel}`;
  }
}
