// slippage.ts

export interface SlippageEstimate {
  estimatedSlippageUsd: number;
  confidence: number;
}

/**
 * Estimates execution slippage impact from latency & volatility.
 * This is a proxy model, not real P&L.
 */
export function estimateSlippage(
  currentP99: number,
  prevP99: number | null,
  volatility: number
) {
  const baselineMs = 100;

  const latencyPenalty = Math.max(0, currentP99 - baselineMs);
  const estimatedSlippageUsd =
    latencyPenalty * volatility * 0.01;

  let confidence = 0.9;

  if (prevP99 !== null) {
    const delta = Math.abs(currentP99 - prevP99);

    if (delta > 300) confidence -= 0.4;
    else if (delta > 150) confidence -= 0.25;
    else if (delta > 75) confidence -= 0.15;
  }

  confidence -= volatility * 0.1;

  return {
    estimatedSlippageUsd,
    confidence: Math.max(0.1, confidence)
  };
}

function clamp(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x));
}