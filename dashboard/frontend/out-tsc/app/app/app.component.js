import { __decorate } from "tslib";
import { CommonModule } from '@angular/common';
import { HttpParams } from '@angular/common/http';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgxEchartsDirective } from 'ngx-echarts';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TextareaModule } from 'primeng/textarea';
let AppComponent = class AppComponent {
    http;
    darkModeStorageKey = 'frugal-ai-dashboard.darkMode';
    apiBaseUrl = 'http://localhost:5112/api/requests';
    co2GramsPerTree = 21_770;
    requestToken = 0;
    models = signal(['gpt-4.1', 'gpt-4.1-mini']);
    routingMethods = signal(['round-robin', 'latency-first', 'cost-optimized']);
    modelOptions = computed(() => this.models().map((model) => ({ label: model, value: model })));
    routingOptions = computed(() => this.routingMethods().map((routingMethod) => ({ label: routingMethod, value: routingMethod })));
    comparisonModel = signal('gpt-4.1');
    selectedRoutingMethods = signal([]);
    minimumUserScoreInput = signal('0');
    timeZone = signal(this.detectLocalTimeZone());
    startDateTimeInput = signal(this.getDefaultLocalDateTimeInput(-60));
    endDateTimeInput = signal(this.getDefaultLocalDateTimeInput(0));
    chatPrompt = signal('');
    chatOpen = signal(false);
    darkMode = signal(false);
    loading = signal(false);
    error = signal('');
    dashboardData = signal(null);
    metricDefinitions = [
        { key: 'powerWh', label: 'Power (Wh)' },
        { key: 'co2', label: 'CO2 (g)' },
        { key: 'waterMl', label: 'Water (ml)' },
        { key: 'costUsd', label: 'Cost (USD)' }
    ];
    timeZoneOptions = [
        'UTC',
        'Europe/Berlin',
        'America/New_York',
        'America/Chicago',
        'America/Denver',
        'America/Los_Angeles',
        'Asia/Tokyo'
    ];
    constructor(http) {
        this.http = http;
        if (typeof window !== 'undefined') {
            const persisted = window.localStorage.getItem(this.darkModeStorageKey);
            if (persisted === 'true' || persisted === 'false') {
                this.setDarkMode(persisted === 'true');
            }
            else {
                this.setDarkMode(false);
            }
        }
        this.loadDashboardData();
    }
    minimumUserScore = computed(() => {
        const normalized = this.minimumUserScoreInput().replace(',', '.').trim();
        const parsed = Number(normalized);
        if (Number.isNaN(parsed)) {
            return 0;
        }
        const clamped = Math.min(5, Math.max(0, parsed));
        return Number(clamped.toFixed(1));
    });
    visibleRequests = computed(() => this.dashboardData() ?? []);
    totalPowerWh = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.actual.powerWh, 0) ?? 0);
    totalCo2 = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.actual.co2, 0) ?? 0);
    totalWaterMl = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.actual.waterMl, 0) ?? 0);
    totalCostUsd = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.actual.costUsd, 0) ?? 0);
    totalComparisonPowerWh = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.comparison.powerWh, 0) ?? 0);
    totalComparisonCo2 = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.comparison.co2, 0) ?? 0);
    totalComparisonWaterMl = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.comparison.waterMl, 0) ?? 0);
    totalComparisonCostUsd = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.comparison.costUsd, 0) ?? 0);
    totalInputTokens = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.inputTokens, 0) ?? 0);
    totalOutputTokens = computed(() => this.dashboardData()?.reduce((sum, r) => sum + r.outputTokens, 0) ?? 0);
    treesSaved = computed(() => {
        const co2Delta = this.totalComparisonCo2() - this.totalCo2();
        return Math.max(0, co2Delta / this.co2GramsPerTree);
    });
    avgValidationScore = computed(() => this.dashboardData()?.length ? this.dashboardData().reduce((sum, r) => sum + r.validationScore, 0) / this.dashboardData().length : 0);
    avgDurationMs = computed(() => this.dashboardData()?.length ? this.dashboardData().reduce((sum, r) => sum + r.durationMs, 0) / this.dashboardData().length : 0);
    sustainabilityChartSections = computed(() => {
        const data = this.dashboardData();
        if (!data) {
            return [];
        }
        const isDark = this.darkMode();
        const groupedByRouting = new Map();
        for (const request of data) {
            const existing = groupedByRouting.get(request.routingMethod);
            if (existing) {
                existing.push(request);
            }
            else {
                groupedByRouting.set(request.routingMethod, [request]);
            }
        }
        return Array.from(groupedByRouting.entries()).map(([routingMethod, requests]) => {
            const metrics = this.metricDefinitions.map((metricDefinition) => ({
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
    sendPrompt() {
        const prompt = this.chatPrompt().trim();
        if (!prompt) {
            return;
        }
        const payload = {
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
    toggleChat() {
        this.chatOpen.update((open) => !open);
    }
    setDarkMode(enabled) {
        this.darkMode.set(enabled);
        if (typeof document !== 'undefined') {
            document.documentElement.classList.toggle('app-dark', enabled);
        }
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(this.darkModeStorageKey, String(enabled));
        }
    }
    setMinimumUserScoreInput(value) {
        this.minimumUserScoreInput.set(String(value ?? ''));
        this.loadDashboardData();
    }
    setTimeZone(value) {
        this.timeZone.set(value);
        this.loadDashboardData();
    }
    setStartDateTimeInput(value) {
        this.startDateTimeInput.set(String(value ?? ''));
        this.loadDashboardData();
    }
    setEndDateTimeInput(value) {
        this.endDateTimeInput.set(String(value ?? ''));
        this.loadDashboardData();
    }
    setComparisonModel(value) {
        this.comparisonModel.set(value);
        this.loadDashboardData();
    }
    setSelectedRoutingMethods(value) {
        this.selectedRoutingMethods.set(value);
        this.loadDashboardData();
    }
    formatTimestamp(iso) {
        return new Date(iso).toLocaleString([], { hour12: false, month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }
    formatDuration(durationMs) {
        return `${(durationMs / 1000).toFixed(2)} s`;
    }
    formatCost(costUsd) {
        return `$${costUsd.toFixed(4)}`;
    }
    formatScore(score) {
        return `${score.toFixed(1)} / 5`;
    }
    formatTreesSaved(treesSaved) {
        if (treesSaved === 0) {
            return '0';
        }
        return treesSaved < 1 ? treesSaved.toFixed(2) : treesSaved.toFixed(1);
    }
    modelDelta(request) {
        return `${request.model} vs ${this.comparisonModel()}`;
    }
    loadDashboardData() {
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
        this.http.get(this.apiBaseUrl, { params }).subscribe({
            next: (data) => {
                if (currentToken !== this.requestToken) {
                    return;
                }
                const requests = data.map((request) => this.toViewModel(request));
                this.dashboardData.set(requests);
                const models = this.uniqueStrings(requests.map((request) => request.model));
                const routingMethods = this.uniqueStrings(requests.map((request) => request.routingMethod));
                if (models.length > 0) {
                    this.models.set(models);
                    if (!models.includes(this.comparisonModel())) {
                        this.comparisonModel.set(models[0]);
                    }
                }
                if (routingMethods.length > 0) {
                    this.routingMethods.set(routingMethods);
                    this.selectedRoutingMethods.update((selected) => {
                        if (selected.length === 0) {
                            return routingMethods;
                        }
                        return selected.filter((routingMethod) => routingMethods.includes(routingMethod));
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
    toViewModel(request) {
        return {
            ...request,
            createdAt: request.created,
            powerWh: request.actual.powerWh,
            co2: request.actual.co2,
            waterMl: request.actual.waterMl,
            costUsd: request.actual.costUsd
        };
    }
    uniqueStrings(values) {
        return Array.from(new Set(values));
    }
    getDefaultLocalDateTimeInput(offsetMinutesFromNow) {
        const date = new Date(Date.now() + offsetMinutesFromNow * 60_000);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hour = String(date.getHours()).padStart(2, '0');
        const minute = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hour}:${minute}`;
    }
    detectLocalTimeZone() {
        try {
            const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
            return resolved || 'UTC';
        }
        catch {
            return 'UTC';
        }
    }
    toApiDateTimeOffset(localDateTime, timeZone) {
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
    parseLocalDateTime(value) {
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
    getOffsetMinutes(timeZone, date) {
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
        const values = {};
        for (const part of parts) {
            if (part.type !== 'literal') {
                values[part.type] = part.value;
            }
        }
        const utcFromTimeZoneClock = Date.UTC(Number(values['year']), Number(values['month']) - 1, Number(values['day']), Number(values['hour']), Number(values['minute']), Number(values['second']));
        return (utcFromTimeZoneClock - date.getTime()) / 60_000;
    }
    metricColor(metricKey) {
        return metricKey === 'powerWh'
            ? '#f05d23'
            : metricKey === 'co2'
                ? '#2b7fff'
                : metricKey === 'waterMl'
                    ? '#18a46c'
                    : '#b256d9';
    }
};
AppComponent = __decorate([
    Component({
        selector: 'app-root',
        standalone: true,
        imports: [CommonModule, FormsModule, NgxEchartsDirective, ButtonModule, CardModule, SelectModule, MultiSelectModule, TableModule, TextareaModule],
        templateUrl: './app.component.html',
        styleUrl: './app.component.css'
    })
], AppComponent);
export { AppComponent };
