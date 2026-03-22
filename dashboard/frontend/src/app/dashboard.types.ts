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
  routingOutcome?: string | null;
  prompt: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  validationScore: number | null;
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

export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
  routingOutcome?: string;
  requestId?: string;
  stars?: number | null;
  starsSaving?: boolean;
  starsHover?: number | null;
};

export type OpenAiModelListResponse = {
  data?: Array<{
    id?: string;
    metadata?: {
      llmproxy?: {
        kind?: string;
        middleware_id?: string;
        selector?: string;
      };
    };
  }>;
};
