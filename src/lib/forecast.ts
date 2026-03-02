export function parseResolvedOutcome(result?: string): 0 | 1 | null {
  if (!result) return null;
  const normalized = result.toLowerCase();
  if (normalized === 'yes' || normalized === 'true') return 1;
  if (normalized === 'no' || normalized === 'false') return 0;
  return null;
}

export function brierScore(probability: number, outcome: 0 | 1): number {
  const diff = probability - outcome;
  return diff * diff;
}

export function realizedReturnPct(
  side: 'yes' | 'no',
  fillPrice: number,
  outcome: 0 | 1
): number {
  const clampedFill = Math.max(0, Math.min(1, fillPrice));
  if (side === 'yes') {
    return ((outcome === 1 ? 1 - clampedFill : -clampedFill) * 100);
  }
  return ((outcome === 0 ? 1 - clampedFill : -clampedFill) * 100);
}

export function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
