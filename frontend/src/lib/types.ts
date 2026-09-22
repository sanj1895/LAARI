// Hardware abstraction types for the inference system

export interface GPUSpec {
    id: string;
    name: string;
    memoryGB: number;
    computeUnits: number;
    bandwidthGBps: number;
    costPerSecond: number; // $/second
    maxBatchSize: number;
    baseLatencyMs: number;
}

export interface CPUSpec {
    id: string;
    name: string;
    cores: number;
    threadsPerCore: number;
    cacheSizeMB: number;
    numaNodes: number;
    costPerSecond: number;
    baseLatencyMs: number;
}

export interface MemoryHierarchy {
    l1CacheKB: number;
    l2CacheMB: number;
    l3CacheMB: number;
    hbmGB: number;
    hbmBandwidthGBps: number;
}

export interface HardwareState {
    gpuUtilization: number; // 0-1
    gpuMemoryUsed: number;  // GB
    gpuMemoryTotal: number; // GB
    cpuUtilization: number; // 0-1
    kvCacheSize: number;    // MB
    activeRequests: number;
    queuedRequests: number;
}

export interface HardwareConfig {
    gpu: GPUSpec;
    cpu: CPUSpec;
    memory: MemoryHierarchy;
}

// Model variant types
export type QuantizationType = 'FP32' | 'FP16' | 'INT8' | 'INT4';

export interface ModelVariant {
    id: string;
    name: string;
    quantization: QuantizationType;
    sizeGB: number;
    accuracyScore: number; // 0-1, relative to FP32
    speedupFactor: number; // relative to FP32
    memoryReduction: number; // relative to FP32
}

// Inference request types
export type RequestPriority = 'critical' | 'high' | 'medium' | 'low';
export type RequestType = 'risk_check' | 'pricing' | 'fraud_detection' | 'compliance';

export interface InferenceRequest {
    id: string;
    type: RequestType;
    priority: RequestPriority;
    sloMs: number;           // target latency SLO
    timestamp: number;
    payload: {
        complexity: number;    // 0-1, affects computation time
        tokenCount: number;    // affects KV cache
    };
}

export interface InferenceResult {
    id: string;
    requestId?: string;
    latencyMs: number;
    provider: 'LOCAL' | 'CLOUD'; 
    modelVariant?: QuantizationType;
    batchSize?: number;
    sloMet?: boolean;
    sloViolated: boolean;
    cost: number;
    breakdown: {
        queueTimeMs?: number;
        computeTimeMs?: number;
        memoryTimeMs?: number;
        computeMs: number;
        memoryMs: number;
    };
}

// System metrics
export interface SystemMetrics {
    timestamp: number;
    requestsPerSecond: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    sloViolationRate: number;
    gpuCost: number;
    cpuCost: number;
    totalCost: number;
    riskExposure: number;
}

// Scheduling decisions
export interface SchedulingDecision {
    requestId: string;
    hardware: 'gpu' | 'cpu';
    modelVariant: QuantizationType;
    batchSize: number;
    estimatedLatencyMs: number;
    estimatedCost: number;
    reason: string;
}
