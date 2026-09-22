// GPU Simulation with memory pressure and compute modeling

import type { GPUSpec, HardwareState, QuantizationType } from '../types';

// Default GPU spec (modeled after A100)
export const DEFAULT_GPU: GPUSpec = {
    id: 'gpu-0',
    name: 'NVIDIA A100-80GB',
    memoryGB: 80,
    computeUnits: 108,
    bandwidthGBps: 2039,
    costPerSecond: 0.0031, // ~$11/hour
    maxBatchSize: 64,
    baseLatencyMs: 2,
};

// Simulated GPU state
export class GPUSimulator {
    private spec: GPUSpec;
    private memoryUsed: number = 0;
    private utilization: number = 0;
    private kvCacheSize: number = 0;
    private activeRequests: number = 0;

    constructor(spec: GPUSpec = DEFAULT_GPU) {
        this.spec = spec;
    }

    // Calculate inference latency based on current state
    calculateLatency(
        batchSize: number,
        complexity: number,
        quantization: QuantizationType,
        tokenCount: number
    ): { latencyMs: number; computeMs: number; memoryMs: number } {
        // Quantization speedup factors
        const quantSpeedup: Record<QuantizationType, number> = {
            'FP32': 1.0,
            'FP16': 1.8,
            'INT8': 3.2,
            'INT4': 5.0,
        };

        // Base compute time
        const baseCompute = this.spec.baseLatencyMs * complexity;
        const computeMs = baseCompute * batchSize * (1 / quantSpeedup[quantization]);

        // Memory access time (affected by KV cache and batch size)
        const kvCacheOverhead = this.kvCacheSize / 1000; // Normalize
        const memoryPressure = this.memoryUsed / this.spec.memoryGB;
        const memoryMs = (tokenCount * 0.001 + kvCacheOverhead) * (1 + memoryPressure);

        // Contention overhead when highly utilized
        const contentionFactor = 1 + (this.utilization ** 2);

        const totalLatency = (computeMs + memoryMs) * contentionFactor;

        return {
            latencyMs: totalLatency,
            computeMs,
            memoryMs,
        };
    }

    // Estimate if we can meet an SLO
    canMeetSLO(
        sloMs: number,
        batchSize: number,
        complexity: number,
        quantization: QuantizationType,
        tokenCount: number
    ): boolean {
        const { latencyMs } = this.calculateLatency(batchSize, complexity, quantization, tokenCount);
        return latencyMs <= sloMs * 0.9; // 10% safety margin
    }

    // Allocate resources for a request
    allocate(batchSize: number, tokenCount: number, quantization: QuantizationType): boolean {
        const memoryPerRequest: Record<QuantizationType, number> = {
            'FP32': 0.5,
            'FP16': 0.25,
            'INT8': 0.125,
            'INT4': 0.0625,
        };

        const memoryNeeded = batchSize * memoryPerRequest[quantization];
        const kvCacheNeeded = tokenCount * 0.001; // MB per token

        if (this.memoryUsed + memoryNeeded > this.spec.memoryGB * 0.95) {
            return false; // OOM protection
        }

        this.memoryUsed += memoryNeeded;
        this.kvCacheSize += kvCacheNeeded;
        this.activeRequests += batchSize;
        this.updateUtilization();
        return true;
    }

    // Release resources after request completes
    release(batchSize: number, tokenCount: number, quantization: QuantizationType): void {
        const memoryPerRequest: Record<QuantizationType, number> = {
            'FP32': 0.5,
            'FP16': 0.25,
            'INT8': 0.125,
            'INT4': 0.0625,
        };

        const memoryReleased = batchSize * memoryPerRequest[quantization];
        const kvCacheReleased = tokenCount * 0.001;

        this.memoryUsed = Math.max(0, this.memoryUsed - memoryReleased);
        this.kvCacheSize = Math.max(0, this.kvCacheSize - kvCacheReleased);
        this.activeRequests = Math.max(0, this.activeRequests - batchSize);
        this.updateUtilization();
    }

    private updateUtilization(): void {
        // Utilization based on memory and active requests
        const memoryUtil = this.memoryUsed / this.spec.memoryGB;
        const requestUtil = Math.min(1, this.activeRequests / this.spec.maxBatchSize);
        this.utilization = Math.max(memoryUtil, requestUtil);
    }

    // Get optimal batch size for SLO
    getOptimalBatchSize(sloMs: number, complexity: number, quantization: QuantizationType): number {
        for (let batch = 1; batch <= this.spec.maxBatchSize; batch++) {
            if (!this.canMeetSLO(sloMs, batch, complexity, quantization, 100)) {
                return Math.max(1, batch - 1);
            }
        }
        return this.spec.maxBatchSize;
    }

    // Get cost for a request
    getCost(latencyMs: number): number {
        return (latencyMs / 1000) * this.spec.costPerSecond;
    }

    getState(): Partial<HardwareState> {
        return {
            gpuUtilization: this.utilization,
            gpuMemoryUsed: this.memoryUsed,
            gpuMemoryTotal: this.spec.memoryGB,
            kvCacheSize: this.kvCacheSize,
            activeRequests: this.activeRequests,
        };
    }

    getSpec(): GPUSpec {
        return this.spec;
    }

    // Reset to clean state
    reset(): void {
        this.memoryUsed = 0;
        this.utilization = 0;
        this.kvCacheSize = 0;
        this.activeRequests = 0;
    }
}
