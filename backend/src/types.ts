export type SavedReport = {
  userId: string;       // Auth0 `sub`
  html: string;         // full HTML report
  createdAt: Date;
};

export interface RiskReport {
  createdAt: Date;

  p99LatencyMs: number;
  meanLatencyMs: number;

  riskExposureUsd: number;
  worstCaseLossUsd: number;

  scenarioCount: number;

  htmlReport: string;

  metadata?: {
    model?: string;
    region?: string;
    notes?: string;
    routing?: "LOCAL" | "CLOUD";
  };
}

export type SimulationStatus = "RUNNING" | "COMPLETED";

export interface Simulation {
  id: string;
  type: string;
  status: SimulationStatus;
  startedAt: number;
  endedAt?: number;
}

// NEW: Combined metrics row structure (matches the table columns)
export interface CombinedMetricRow {
  timestamp: string;
  p50_ms: string;
  p99_ms: string;
  sample_count: number;
  latency_ms: string;
  provider: string;
  slo_violated: string;
  estimated_slippage_usd: string;
  slippage_confidence: string;
}

// NEW: Monitoring session data
export interface MetricsSession {
  userId?: string; // Optional, from JWT if available
  sessionStartedAt: Date;
  sessionEndedAt: Date;
  metricsData: CombinedMetricRow[];
  summary: {
    totalSamples: number;
    avgP99: number;
    maxSlippage: number;
  };
}

