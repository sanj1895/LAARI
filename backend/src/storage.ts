// backend/src/storage.ts

// ==========================
// Types
// ==========================

export interface LatencySample {
  timestamp: number;     // Unix ms
  latencyMs: number;     // Observed latency
  volatility: number;    // Market volatility at time of observation
}

export interface InferenceRecord {
  id: string;
  timestamp: number;
  latencyMs: number;
  provider: "LOCAL" | "CLOUD";   // aligned with routing + CSV
  cost: number;                  // USD cost (0 for local)
  sloViolated: boolean;
}

// ==========================
// Internal Append-Only Stores
// ==========================

const latencySamples: LatencySample[] = [];
const inferenceLog: InferenceRecord[] = [];

// Hard caps to prevent memory blowups
const MAX_LATENCY_SAMPLES = 10_000;
const MAX_INFERENCE_LOGS = 5_000;

// ==========================
// Write APIs (authoritative)
// ==========================

/**
 * Record a latency observation (append-only, audit safe)
 */
export function recordLatency(latencyMs: number, volatility: number) {
  latencySamples.push({
    timestamp: Date.now(),
    latencyMs,
    volatility,
  });

  if (latencySamples.length > MAX_LATENCY_SAMPLES) {
    latencySamples.shift();
  }
}

/**
 * Record an inference execution
 */
export function recordInference(record: InferenceRecord) {
  inferenceLog.push(record);

  if (inferenceLog.length > MAX_INFERENCE_LOGS) {
    inferenceLog.shift();
  }
}

// ==========================
// Read APIs (defensive copies)
// ==========================

/**
 * Read-only access to latency samples
 */
export function getLatencySamples(): LatencySample[] {
  return [...latencySamples];
}

/**
 * Read-only access to inference log
 */
export function getInferenceLog(): InferenceRecord[] {
  return [...inferenceLog];
}

export function clearLatencySamples() {
  latencySamples.length = 0;
}

export function clearInferenceLog() {
  inferenceLog.length = 0;
}