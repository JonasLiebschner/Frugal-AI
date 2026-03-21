import { Injectable, computed, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import type { EChartsOption } from 'echarts';
import { MessageService } from 'primeng/api';

import { environment } from '../environments/environment';
import { formatCost, formatDuration, formatScore, formatTimestamp, formatTreesSaved, modelDelta } from './dashboard-formatters';
import type {
  AiRequest,
  ApiAiRequest,
  ChartMetric,
  ChatMessage,
  LocalDateTimeParts,
  MetricSummaryCard,
  OpenAiModelListResponse,
  RoutingMethodChartSection,
  SelectOption
} from './dashboard.types';

@Injectable({ providedIn: 'root' })
export class DashboardStore {
  private readonly darkModeStorageKey = 'frugal-ai-dashboard.darkMode';
  private readonly apiBaseUrl = environment.api_url + '/api/requests';
  private readonly comparisonModelsUrl = `${this.apiBaseUrl}/comparison-models`;
  private readonly co2GramsPerTree = 21_770;
  private requestToken = 0;

  readonly models = signal<string[]>(['gpt-4.1', 'gpt-4.1-mini']);
  readonly routingMethods = signal<string[]>([]);
  readonly comparisonModel = signal<string>('gpt-4.1');
  readonly selectedRoutingMethods = signal<string[]>([]);
  readonly timeZone = signal<string>(this.detectLocalTimeZone());
  readonly startDateTimeInput = signal<string>(this.getDefaultLocalDateTimeInput(-60));
  readonly endDateTimeInput = signal<string>(this.getDefaultLocalDateTimeInput(0));
  readonly chatPrompt = signal<string>('');
  readonly chatMessages = signal<ChatMessage[]>([]);
  readonly chatSelectedModel = signal<string>('auto');
  readonly chatSelectedRoutingMethod = signal<string>('');
  readonly chatRoutingMethods = signal<string[]>([]);
  readonly chatModels = signal<string[]>(['auto', ...environment.openai_models]);
  readonly chatSubmitting = signal<boolean>(false);
  readonly darkMode = signal<boolean>(false);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string>('');

  private readonly dashboardData = signal<AiRequest[] | null>(null);
  private readonly metricDefinitions: Array<{ key: ChartMetric['metricKey']; label: string }> = [
    { key: 'powerWh', label: 'Power (Wh)' },
    { key: 'co2', label: 'CO2 (g)' },
    { key: 'waterMl', label: 'Water (ml)' },
    { key: 'costUsd', label: 'Cost (USD)' }
  ];

  readonly timeZoneOptions = [
    'UTC',
    'Europe/Berlin',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Asia/Tokyo'
  ];

  readonly modelOptions = computed<SelectOption[]>(() => this.models().map((model) => ({ label: model, value: model })));
  readonly routingOptions = computed<SelectOption[]>(() => this.routingMethods().map((routingMethod) => ({ label: routingMethod, value: routingMethod })));
  readonly chatRoutingOptions = computed<SelectOption[]>(() => this.chatRoutingMethods().map((routingMethod) => ({ label: routingMethod, value: routingMethod })));
  readonly chatModelOptions = computed<SelectOption[]>(() => this.chatModels().map((model) => ({ label: model === 'auto' ? 'Auto' : model, value: model })));
  readonly canSelectChatRoutingMethod = computed(() => this.chatSelectedModel() === 'auto');

  readonly visibleRequests = computed(() => this.dashboardData() ?? []);
  readonly totalPowerWh = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.actual.powerWh, 0) ?? 0);
  readonly totalCo2 = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.actual.co2, 0) ?? 0);
  readonly totalWaterMl = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.actual.waterMl, 0) ?? 0);
  readonly totalCostUsd = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.actual.costUsd, 0) ?? 0);
  readonly totalComparisonPowerWh = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.comparison.powerWh, 0) ?? 0);
  readonly totalComparisonCo2 = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.comparison.co2, 0) ?? 0);
  readonly totalComparisonWaterMl = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.comparison.waterMl, 0) ?? 0);
  readonly totalComparisonCostUsd = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.comparison.costUsd, 0) ?? 0);
  readonly totalInputTokens = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.inputTokens, 0) ?? 0);
  readonly totalOutputTokens = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.outputTokens, 0) ?? 0);
  readonly treesSaved = computed(() => Math.max(0, (this.totalComparisonCo2() - this.totalCo2()) / this.co2GramsPerTree));
  readonly avgValidationScore = computed(() => this.dashboardData()?.length ? this.dashboardData()!.reduce((sum, r) => sum + r.validationScore, 0) / this.dashboardData()!.length : 0);
  readonly avgDurationMs = computed(() => this.dashboardData()?.length ? this.dashboardData()!.reduce((sum, r) => sum + r.durationMs, 0) / this.dashboardData()!.length : 0);

  readonly sustainabilityMetricCards = computed<MetricSummaryCard[]>(() => [
    { label: 'Power', value: `${this.totalPowerWh().toFixed(1)} Wh`, comparison: `Comparison: ${this.totalComparisonPowerWh().toFixed(1)} Wh` },
    { label: 'CO2', value: `${this.totalCo2().toFixed(1)} g`, comparison: `Comparison: ${this.totalComparisonCo2().toFixed(1)} g` },
    { label: 'Water', value: `${this.totalWaterMl().toFixed(0)} ml`, comparison: `Comparison: ${this.totalComparisonWaterMl().toFixed(0)} ml` },
    { label: 'Total Cost', value: formatCost(this.totalCostUsd()), comparison: `Comparison: ${formatCost(this.totalComparisonCostUsd())}` },
    { label: 'Trees Saved', value: formatTreesSaved(this.treesSaved()), comparison: 'Estimated from CO2 reduction' }
  ]);

  readonly generalMetricCards = computed<MetricSummaryCard[]>(() => [
    { label: 'Total Requests', value: String(this.visibleRequests().length) },
    { label: 'Input Tokens', value: String(this.totalInputTokens()) },
    { label: 'Output Tokens', value: String(this.totalOutputTokens()) },
    { label: 'Avg Duration', value: formatDuration(this.avgDurationMs()) },
    { label: 'Validation Score', value: formatScore(this.avgValidationScore()) }
  ]);

  readonly sustainabilityChartSections = computed<RoutingMethodChartSection[]>(() => {
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

    return Array.from(groupedByRouting.entries()).map(([routingMethod, requests]) => ({
      routingMethod,
      charts: this.metricDefinitions.map((metricDefinition) => {
        const metric: ChartMetric = {
          metricKey: metricDefinition.key,
          metricLabel: metricDefinition.label,
          points: requests.slice().reverse().map((request) => ({
            requestId: request.id,
            actual: request.actual[metricDefinition.key],
            comparison: request.comparison[metricDefinition.key]
          }))
        };
        const color = this.metricColor(metric.metricKey);

        return {
          key: `${routingMethod}-${metric.metricKey}`,
          title: metric.metricLabel,
          subtitle: `Actual vs ${this.comparisonModel()}`,
          options: {
            tooltip: { trigger: 'axis' },
            legend: { top: 4, textStyle: { color: isDark ? '#c4d1df' : '#56544f' } },
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
          } satisfies EChartsOption
        };
      })
    }));
  });

  readonly formatTimestamp = formatTimestamp;
  readonly formatDuration = formatDuration;
  readonly formatCost = formatCost;
  readonly formatScore = formatScore;
  readonly formatTreesSaved = formatTreesSaved;

  constructor(
    private readonly http: HttpClient,
    private readonly messageService: MessageService
  ) {
    if (typeof window !== 'undefined') {
      const persisted = window.localStorage.getItem(this.darkModeStorageKey);
      this.setDarkMode(persisted === 'true');
    }

    this.loadChatModels();
    this.loadComparisonModels();
    this.loadDashboardData();
  }

  async sendPrompt(): Promise<void> {
    const prompt = this.chatPrompt().trim();
    if (!prompt) {
      return;
    }

    if (!environment.openai_api_key) {
      this.messageService.add({
        severity: 'error',
        summary: 'Missing OpenAI token',
        detail: 'Set environment.openai_api_key in the frontend environment config.'
      });
      return;
    }

    const nextMessages: ChatMessage[] = [{ role: 'user', content: prompt }];
    const model = this.resolveChatModel();
    if (!model) {
      this.messageService.add({
        severity: 'error',
        summary: 'No routing method available',
        detail: 'No middleware routing method is available for Auto mode.'
      });
      return;
    }

    this.chatSubmitting.set(true);
    this.chatMessages.set(nextMessages);
    this.chatPrompt.set('');

    try {
      const response = await fetch(`${environment.openai_base_url.replace(/\/$/, '')}/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${environment.openai_api_key}`
        },
        body: JSON.stringify({
          model,
          store: false,
          input: prompt
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? 'Failed to submit request.');
      }

      const assistantText = this.extractAssistantText(payload);
      if (!assistantText) {
        throw new Error('OpenAI response did not contain assistant text.');
      }

      this.chatMessages.set([...nextMessages, { role: 'assistant', content: assistantText }]);
    } catch (error) {
      this.chatMessages.set([]);
      this.chatPrompt.set(prompt);
      this.messageService.add({
        severity: 'error',
        summary: 'Request failed',
        detail: error instanceof Error ? error.message : 'Failed to submit request.'
      });
    } finally {
      this.chatSubmitting.set(false);
    }
  }

  setDarkMode(enabled: boolean): void {
    this.darkMode.set(enabled);
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('app-dark', enabled);
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(this.darkModeStorageKey, String(enabled));
    }
  }

  setTimeZone(value: string): void {
    this.timeZone.set(value);
    this.loadDashboardData();
  }

  setStartDateTimeInput(value: unknown): void {
    this.startDateTimeInput.set(String(value ?? ''));
    this.loadDashboardData();
  }

  setEndDateTimeInput(value: unknown): void {
    this.endDateTimeInput.set(String(value ?? ''));
    this.loadDashboardData();
  }

  setComparisonModel(value: string): void {
    this.comparisonModel.set(value);
    this.loadDashboardData();
  }

  setSelectedRoutingMethods(value: string[]): void {
    this.selectedRoutingMethods.set(value);
    this.loadDashboardData();
  }

  setChatSelectedModel(value: string): void {
    this.chatSelectedModel.set(value);
  }

  setChatSelectedRoutingMethod(value: string): void {
    this.chatSelectedRoutingMethod.set(value);
  }

  clearChat(): void {
    this.chatMessages.set([]);
    this.chatPrompt.set('');
  }

  getModelDelta(request: AiRequest): string {
    return modelDelta(request, this.comparisonModel());
  }

  private loadDashboardData(): void {
    const currentToken = ++this.requestToken;
    let params = new HttpParams().set('comparisonModel', this.comparisonModel());

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

        const requestRoutingMethods = this.uniqueStrings(requests.map((request) => request.routingMethod));
        this.syncDashboardRoutingMethods(requestRoutingMethods, true);
      },
      error: () => {
        if (currentToken === this.requestToken) {
          this.error.set('Failed to load dashboard data from backend.');
        }
      },
      complete: () => {
        if (currentToken === this.requestToken) {
          this.loading.set(false);
        }
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

  private loadChatModels(): void {
    this.http.get<OpenAiModelListResponse>(environment.openai_models_url).subscribe({
      next: (response) => {
        const entries = response.data ?? [];
        const availableModels = this.uniqueStrings(
          entries
            .filter((entry) => entry.metadata?.llmproxy?.kind !== 'routing_middleware')
            .map((entry) => entry.id?.trim() ?? '')
            .filter((model) => model.length > 0)
        );
        const availableRoutingMethods = this.uniqueStrings(
          entries
            .filter((entry) => entry.metadata?.llmproxy?.kind === 'routing_middleware')
            .map((entry) => entry.metadata?.llmproxy?.selector?.trim() || entry.id?.trim() || '')
            .filter((routingMethod) => routingMethod.length > 0)
        );

        if (availableRoutingMethods.length > 0) {
          this.syncDashboardRoutingMethods(availableRoutingMethods, false);
          this.chatRoutingMethods.set(availableRoutingMethods);
          if (!availableRoutingMethods.includes(this.chatSelectedRoutingMethod())) {
            this.chatSelectedRoutingMethod.set(availableRoutingMethods[0]);
          }
        }

        if (availableModels.length > 0) {
          this.chatModels.set(['auto', ...availableModels]);
          if (this.chatSelectedModel() !== 'auto' && !availableModels.includes(this.chatSelectedModel())) {
            this.chatSelectedModel.set('auto');
          }
        }
      },
      error: () => {
        this.chatModels.set(['auto', ...environment.openai_models]);
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

  private syncDashboardRoutingMethods(nextValues: string[], selectWhenEmpty: boolean): void {
    const nextRoutingMethods = this.uniqueStrings([...this.routingMethods(), ...nextValues]);
    if (nextRoutingMethods.length === 0) {
      return;
    }

    this.routingMethods.set(nextRoutingMethods);
    this.selectedRoutingMethods.update((selected) => selected.length === 0
      ? (selectWhenEmpty ? nextValues : selected)
      : selected.filter((routingMethod) => nextRoutingMethods.includes(routingMethod)));
  }

  private getDefaultLocalDateTimeInput(offsetMinutesFromNow: number): string {
    const date = new Date(Date.now() + offsetMinutesFromNow * 60_000);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  private detectLocalTimeZone(): string {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
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

    for (let i = 0; i < 3; i += 1) {
      instantMs = wallClockMs - this.getOffsetMinutes(timeZone, new Date(instantMs)) * 60_000;
    }

    const offsetMinutes = this.getOffsetMinutes(timeZone, new Date(instantMs));
    const offsetSign = offsetMinutes >= 0 ? '+' : '-';
    const absoluteOffset = Math.abs(offsetMinutes);
    const offset = `${offsetSign}${String(Math.floor(absoluteOffset / 60)).padStart(2, '0')}:${String(absoluteOffset % 60).padStart(2, '0')}`;

    return `${localDateTime}:00${offset}`;
  }

  private parseLocalDateTime(value: string): LocalDateTimeParts | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
    if (!match) {
      return null;
    }

    const [, year, month, day, hour, minute] = match;
    return { year: Number(year), month: Number(month), day: Number(day), hour: Number(hour), minute: Number(minute) };
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
    const values: Record<string, string> = {};
    for (const part of formatter.formatToParts(date)) {
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

  private resolveChatModel(): string {
    if (this.chatSelectedModel() !== 'auto') {
      return this.chatSelectedModel();
    }

    if (this.chatRoutingMethods().includes(this.chatSelectedRoutingMethod())) {
      return this.chatSelectedRoutingMethod();
    }

    const availableModels = this.chatModels().filter((model) => model !== 'auto');
    return availableModels[0] ?? '';
  }

  private extractAssistantText(payload: unknown): string {
    if (!payload || typeof payload !== 'object' || !('output' in payload) || !Array.isArray(payload.output)) {
      return '';
    }

    for (const item of payload.output) {
      if (!item || typeof item !== 'object' || item.type !== 'message' || !Array.isArray(item.content)) {
        continue;
      }

      for (const contentItem of item.content) {
        if (contentItem && typeof contentItem === 'object' && contentItem.type === 'output_text' && typeof contentItem.text === 'string') {
          return contentItem.text;
        }
      }
    }

    return '';
  }
}
