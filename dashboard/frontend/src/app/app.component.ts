import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, computed, signal } from '@angular/core';
import type { EChartsOption } from 'echarts';

import { environment } from '../environments/environment';
import { formatCost, formatDuration, formatScore, formatTimestamp, formatTreesSaved, modelDelta } from './dashboard-formatters';
import type {
  AiRequest,
  ApiAiRequest,
  ChartMetric,
  CreateRequestDto,
  LocalDateTimeParts,
  MetricSummaryCard,
  RoutingMethodChartSection
} from './dashboard.types';
import { ChatPanelComponent } from './components/chat-panel.component';
import { ChartsSectionComponent } from './components/charts-section.component';
import { DashboardFiltersComponent } from './components/dashboard-filters.component';
import { DashboardHeaderComponent } from './components/dashboard-header.component';
import { MetricsSectionComponent } from './components/metrics-section.component';
import { RequestsTableComponent } from './components/requests-table.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    DashboardHeaderComponent,
    DashboardFiltersComponent,
    MetricsSectionComponent,
    RequestsTableComponent,
    ChartsSectionComponent,
    ChatPanelComponent
  ],
  templateUrl: './app.component.html',
})
export class AppComponent {
  private readonly darkModeStorageKey = 'frugal-ai-dashboard.darkMode';
  private readonly apiBaseUrl = environment.api_url + '/api/requests';
  private readonly comparisonModelsUrl = `${this.apiBaseUrl}/comparison-models`;
  private readonly co2GramsPerTree = 21_770;

  private requestToken = 0;

  protected readonly models = signal<string[]>(['gpt-4.1', 'gpt-4.1-mini']);
  protected readonly routingMethods = signal<string[]>(['round-robin', 'latency-first', 'cost-optimized']);

  protected readonly modelOptions = computed(() => this.models().map((model) => ({ label: model, value: model })));
  protected readonly routingOptions = computed(() => this.routingMethods().map((routingMethod) => ({ label: routingMethod, value: routingMethod })));

  protected readonly comparisonModel = signal<string>('gpt-4.1');
  protected readonly selectedRoutingMethods = signal<string[]>([]);
  protected readonly minimumUserScoreInput = signal<string>('0');
  protected readonly timeZone = signal<string>(this.detectLocalTimeZone());
  protected readonly startDateTimeInput = signal<string>(this.getDefaultLocalDateTimeInput(-60));
  protected readonly endDateTimeInput = signal<string>(this.getDefaultLocalDateTimeInput(0));
  protected readonly chatPrompt = signal<string>('');
  protected readonly chatOpen = signal<boolean>(false);
  protected readonly darkMode = signal<boolean>(false);

  protected readonly loading = signal<boolean>(false);
  protected readonly error = signal<string>('');

  private readonly dashboardData = signal<AiRequest[] | null>(null);
  private readonly metricDefinitions: Array<{ key: ChartMetric['metricKey']; label: string }> = [
    { key: 'powerWh', label: 'Power (Wh)' },
    { key: 'co2', label: 'CO2 (g)' },
    { key: 'waterMl', label: 'Water (ml)' },
    { key: 'costUsd', label: 'Cost (USD)' }
  ];
  protected readonly timeZoneOptions = [
    'UTC',
    'Europe/Berlin',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Asia/Tokyo'
  ];

  public constructor(private readonly http: HttpClient) {
    if (typeof window !== 'undefined') {
      const persisted = window.localStorage.getItem(this.darkModeStorageKey);
      if (persisted === 'true' || persisted === 'false') {
        this.setDarkMode(persisted === 'true');
      } else {
        this.setDarkMode(false);
      }
    }

    this.loadComparisonModels();
    this.loadDashboardData();
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

  protected readonly visibleRequests = computed(() => this.dashboardData() ?? []);
  protected readonly sustainabilityMetricCards = computed<MetricSummaryCard[]>(() => [
    {
      label: 'Power',
      value: `${this.totalPowerWh().toFixed(1)} Wh`,
      comparison: `Comparison: ${this.totalComparisonPowerWh().toFixed(1)} Wh`
    },
    {
      label: 'CO2',
      value: `${this.totalCo2().toFixed(1)} g`,
      comparison: `Comparison: ${this.totalComparisonCo2().toFixed(1)} g`
    },
    {
      label: 'Water',
      value: `${this.totalWaterMl().toFixed(0)} ml`,
      comparison: `Comparison: ${this.totalComparisonWaterMl().toFixed(0)} ml`
    },
    {
      label: 'Total Cost',
      value: this.formatCost(this.totalCostUsd()),
      comparison: `Comparison: ${this.formatCost(this.totalComparisonCostUsd())}`
    },
    {
      label: 'Trees Saved',
      value: this.formatTreesSaved(this.treesSaved()),
      comparison: 'Estimated from CO2 reduction'
    }
  ]);
  protected readonly generalMetricCards = computed<MetricSummaryCard[]>(() => [
    { label: 'Total Requests', value: String(this.visibleRequests().length) },
    { label: 'Input Tokens', value: String(this.totalInputTokens()) },
    { label: 'Output Tokens', value: String(this.totalOutputTokens()) },
    { label: 'Avg Duration', value: this.formatDuration(this.avgDurationMs()) },
    { label: 'Validation Score', value: this.formatScore(this.avgValidationScore()) }
  ]);

  protected readonly totalPowerWh = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.actual.powerWh, 0) ?? 0);
  protected readonly totalCo2 = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.actual.co2, 0) ?? 0);
  protected readonly totalWaterMl = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.actual.waterMl, 0) ?? 0);
  protected readonly totalCostUsd = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.actual.costUsd, 0) ?? 0);
  protected readonly totalComparisonPowerWh = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.comparison.powerWh, 0) ?? 0);
  protected readonly totalComparisonCo2 = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.comparison.co2, 0) ?? 0);
  protected readonly totalComparisonWaterMl = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.comparison.waterMl, 0) ?? 0);
  protected readonly totalComparisonCostUsd = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.comparison.costUsd, 0) ?? 0);
  protected readonly totalInputTokens = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.inputTokens, 0) ?? 0);
  protected readonly totalOutputTokens = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.outputTokens, 0) ?? 0);
  protected readonly treesSaved = computed(() => {
    const co2Delta = this.totalComparisonCo2() - this.totalCo2();
    return Math.max(0, co2Delta / this.co2GramsPerTree);
  });
  protected readonly avgValidationScore = computed(() => this.dashboardData()?.length ? this.dashboardData()!.reduce((sum, r) => sum + r.validationScore, 0) / this.dashboardData()!.length : 0);
  protected readonly avgDurationMs = computed(() => this.dashboardData()?.length ? this.dashboardData()!.reduce((sum, r) => sum + r.durationMs, 0) / this.dashboardData()!.length : 0);

  protected readonly sustainabilityChartSections = computed<RoutingMethodChartSection[]>(() => {
    const data = this.dashboardData();
    if (!data) {
      return [];
    }

    const isDark = this.darkMode();
    const groupedByRouting = new Map<string, AiRequest[]>();
    for (const request of data) {
      const existing = groupedByRouting.get(request.routingMethod);
      if (existing) {
        existing.push(request);
      } else {
        groupedByRouting.set(request.routingMethod, [request]);
      }
    }

    return Array.from(groupedByRouting.entries()).map(([routingMethod, requests]) => {
      const metrics: ChartMetric[] = this.metricDefinitions.map((metricDefinition) => ({
        metricKey: metricDefinition.key,
        metricLabel: metricDefinition.label,
        points: requests
          .slice()
          .reverse()
          .map((request) => ({
            requestId: request.id,
            actual: request.actual[metricDefinition.key],
            comparison: request.comparison[metricDefinition.key]
          }))
      }));

      return {
        routingMethod,
        charts: metrics.map((metric) => {
          const color = this.metricColor(metric.metricKey);
          return {
            key: `${routingMethod}-${metric.metricKey}`,
            title: metric.metricLabel,
            subtitle: `Actual vs ${this.comparisonModel()}`,
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
                data: metric.points.map((point) => point.requestId)
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
                  name: `${metric.metricLabel} Actual`,
                  itemStyle: { color },
                  lineStyle: { color, width: 2 },
                  data: metric.points.map((point) => point.actual)
                },
                {
                  type: 'line',
                  smooth: true,
                  symbol: 'circle',
                  symbolSize: 6,
                  name: `${metric.metricLabel} Comparison`,
                  itemStyle: { color },
                  lineStyle: { color, width: 2, type: 'dashed' },
                  data: metric.points.map((point) => point.comparison)
                }
              ]
            }
          };
        })
      };
    });
  });

  protected sendPrompt(): void {
    const prompt = this.chatPrompt().trim();
    if (!prompt) {
      return;
    }

    const payload: CreateRequestDto = {
      prompt,
      comparisonModel: this.comparisonModel(),
      routingMethod: this.selectedRoutingMethods()[0]
    };

    this.http.post(this.apiBaseUrl, payload).subscribe({
      next: () => {
        this.chatPrompt.set('');
        this.loadDashboardData();
      },
      error: () => {
        this.error.set('Failed to submit request.');
      }
    });
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
    this.loadDashboardData();
  }

  protected setTimeZone(value: string): void {
    this.timeZone.set(value);
    this.loadDashboardData();
  }

  protected setStartDateTimeInput(value: unknown): void {
    this.startDateTimeInput.set(String(value ?? ''));
    this.loadDashboardData();
  }

  protected setEndDateTimeInput(value: unknown): void {
    this.endDateTimeInput.set(String(value ?? ''));
    this.loadDashboardData();
  }

  protected setComparisonModel(value: string): void {
    this.comparisonModel.set(value);
    this.loadDashboardData();
  }

  protected setSelectedRoutingMethods(value: string[]): void {
    this.selectedRoutingMethods.set(value);
    this.loadDashboardData();
  }

  protected formatTimestamp = formatTimestamp;
  protected formatDuration = formatDuration;
  protected formatCost = formatCost;
  protected formatScore = formatScore;
  protected formatTreesSaved = formatTreesSaved;

  protected modelDelta(request: AiRequest): string {
    return modelDelta(request, this.comparisonModel());
  }

  private loadDashboardData(): void {
    const currentToken = ++this.requestToken;

    let params = new HttpParams()
      .set('comparisonModel', this.comparisonModel())
      .set('minValidationScore', String(this.minimumUserScore()));

    const since = this.toApiDateTimeOffset(this.startDateTimeInput(), this.timeZone());
    if (since) {
      params = params.set('since', since);
    }

    const until = this.toApiDateTimeOffset(this.endDateTimeInput(), this.timeZone());
    if (until) {
      params = params.set('until', until);
    }

    for (const routing of this.selectedRoutingMethods()) {
      params = params.append('routingMethods', routing);
    }

    this.loading.set(true);
    this.error.set('');

    this.http.get<ApiAiRequest[]>(this.apiBaseUrl, { params }).subscribe({
      next: (data) => {
        if (currentToken !== this.requestToken) {
          return;
        }

        const requests = data.map((request) => this.toViewModel(request));
        this.dashboardData.set(requests);

        const routingMethods = this.uniqueStrings(requests.map((request) => request.routingMethod));

        if (routingMethods.length > 0) {
          const selectedRouting = this.selectedRoutingMethods();
          const shouldPreserveExisting = selectedRouting.length > 0;
          const nextRoutingMethods = shouldPreserveExisting
            ? this.uniqueStrings([...this.routingMethods(), ...routingMethods])
            : routingMethods;

          this.routingMethods.set(nextRoutingMethods);
          this.selectedRoutingMethods.update((selected) => {
            if (selected.length === 0) {
              return nextRoutingMethods;
            }
            return selected.filter((routingMethod) => nextRoutingMethods.includes(routingMethod));
          });
        }
      },
      error: () => {
        if (currentToken !== this.requestToken) {
          return;
        }
        this.error.set('Failed to load dashboard data from backend.');
      },
      complete: () => {
        if (currentToken !== this.requestToken) {
          return;
        }
        this.loading.set(false);
      }
    });
  }

  private loadComparisonModels(): void {
    this.http.get<string[]>(this.comparisonModelsUrl).subscribe({
      next: (models) => {
        const availableModels = this.uniqueStrings(models);
        if (availableModels.length === 0) {
          return;
        }

        this.models.set(availableModels);
        if (!availableModels.includes(this.comparisonModel())) {
          this.comparisonModel.set(availableModels[0]);
          this.loadDashboardData();
        }
      }
    });
  }

  private toViewModel(request: ApiAiRequest): AiRequest {
    return {
      ...request,
      createdAt: request.created,
      powerWh: request.actual.powerWh,
      co2: request.actual.co2,
      waterMl: request.actual.waterMl,
      costUsd: request.actual.costUsd
    };
  }

  private uniqueStrings(values: string[]): string[] {
    return Array.from(new Set(values));
  }

  private getDefaultLocalDateTimeInput(offsetMinutesFromNow: number): string {
    const date = new Date(Date.now() + offsetMinutesFromNow * 60_000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hour}:${minute}`;
  }

  private detectLocalTimeZone(): string {
    try {
      const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return resolved || 'UTC';
    } catch {
      return 'UTC';
    }
  }

  private toApiDateTimeOffset(localDateTime: string, timeZone: string): string | null {
    if (!localDateTime) {
      return null;
    }

    const parts = this.parseLocalDateTime(localDateTime);
    if (!parts) {
      return null;
    }

    let instantMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    const wallClockMs = instantMs;

    // Resolve the UTC instant that maps to the requested wall-clock datetime in the selected timezone.
    for (let i = 0; i < 3; i += 1) {
      const offsetMinutes = this.getOffsetMinutes(timeZone, new Date(instantMs));
      instantMs = wallClockMs - offsetMinutes * 60_000;
    }

    const offsetMinutes = this.getOffsetMinutes(timeZone, new Date(instantMs));
    const offsetSign = offsetMinutes >= 0 ? '+' : '-';
    const absoluteOffset = Math.abs(offsetMinutes);
    const offsetHours = Math.floor(absoluteOffset / 60);
    const offsetMins = absoluteOffset % 60;
    const offset = `${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`;

    return `${localDateTime}:00${offset}`;
  }

  private parseLocalDateTime(value: string): LocalDateTimeParts | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
    if (!match) {
      return null;
    }

    const [, year, month, day, hour, minute] = match;
    return {
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute)
    };
  }

  private getOffsetMinutes(timeZone: string, date: Date): number {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const parts = formatter.formatToParts(date);
    const values: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== 'literal') {
        values[part.type] = part.value;
      }
    }

    const utcFromTimeZoneClock = Date.UTC(
      Number(values['year']),
      Number(values['month']) - 1,
      Number(values['day']),
      Number(values['hour']),
      Number(values['minute']),
      Number(values['second'])
    );

    return (utcFromTimeZoneClock - date.getTime()) / 60_000;
  }

  private metricColor(metricKey: ChartMetric['metricKey']): string {
    return metricKey === 'powerWh'
      ? '#f05d23'
      : metricKey === 'co2'
        ? '#2b7fff'
        : metricKey === 'waterMl'
          ? '#18a46c'
          : '#b256d9';
  }
}
