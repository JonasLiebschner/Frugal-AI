import type { AiRequest } from './dashboard.types';

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString([], {
    hour12: false,
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatDuration(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(2)} s`;
}

export function formatCost(costUsd: number): string {
  return `$${costUsd.toFixed(4)}`;
}

export function formatWater(waterMl: number): string {
  return `${waterMl.toFixed(4)} ml`;
}

export function formatScore(score: number | null | undefined): string {
  return score == null ? '' : `${Math.round(score)} / 5`;
}

export function formatTreesSaved(treesSaved: number): string {
  if (treesSaved === 0) {
    return '0';
  }

  return treesSaved < 1 ? treesSaved.toFixed(2) : treesSaved.toFixed(1);
}

export function modelDelta(request: AiRequest, comparisonModel: string): string {
  return `${request.model} vs ${comparisonModel}`;
}
