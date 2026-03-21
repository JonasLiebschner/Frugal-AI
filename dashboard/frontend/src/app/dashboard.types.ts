import type { EChartsOption } from 'echarts';

export type RequestMetadata = {
  powerWh: number;
  co2: number;
  waterMl: number;
  costUsd: number;
};

export type ApiAiRequest = {
  id: string;
  model: string;
  routingMethod: string;
  prompt: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  validationScore: number;
  created: string;
  comparison: RequestMetadata;
  actual: RequestMetadata;
};

export type AiRequest = ApiAiRequest & {
  createdAt: string;
  powerWh: number;
  co2: number;
  waterMl: number;
  costUsd: number;
};

export type CreateRequestDto = {
  prompt: string;
  comparisonModel: string;
  routingMethod?: string;
};

export type ChartMetricPoint = {
  requestId: string;
  actual: number;
  comparison: number;
};

export type ChartMetric = {
  metricKey: 'powerWh' | 'co2' | 'waterMl' | 'costUsd';
  metricLabel: string;
  points: ChartMetricPoint[];
};

export type SustainabilityChartCard = {
  key: string;
  title: string;
  subtitle: string;
  options: EChartsOption;
};

export type RoutingMethodChartSection = {
  routingMethod: string;
  charts: SustainabilityChartCard[];
};

export type LocalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export type SelectOption = {
  label: string;
  value: string;
};

export type MetricSummaryCard = {
  label: string;
  value: string;
  comparison?: string;
};
