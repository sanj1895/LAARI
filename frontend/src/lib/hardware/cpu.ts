// CPU Simulation for fallback/low-priority inference

import type { CPUSpec } from '../types';

// Default CPU spec (modeled after AMD EPYC)
export const DEFAULT_CPU: CPUSpec = {
    id: 'cpu-0',
    name: 'AMD EPYC 7763',
    cores: 64,
    threadsPerCore: 2,
    cacheSizeMB: 256,
    numaNodes: 8,
    costPerSecond: 0.0008, // ~$3/hour
    baseLatencyMs: 15,
};

export class CPUSimulator {
    private spec: CPUSpec;
    private utilization: number = 0;
    private activeThreads: number = 0;

    constructor(spec: CPUSpec = DEFAULT_CPU) {
        this.spec = spec;
    }

    // Calculate inference latency on CPU
    calculateLatency(complexity: number, batchSize: number): {
        latencyMs: number;
        breakdown: { computeMs: number; cacheMs: number };
    } {
        const maxThreads = this.spec.cores * this.spec.threadsPerCore;
        const availableThreads = maxThreads - this.activeThreads;
        const threadScaling = Math.min(1, batchSize / availableThreads);

        // CPU is slower but scales with threads
        const computeMs = this.spec.baseLatencyMs * complexity * (1 + threadScaling);

        // Cache effects - larger batch = more cache pressure
        const cachePressure = Math.min(1, (batchSize * 10) / this.spec.cacheSizeMB);
        const cacheMs = cachePressure * 5; // Up to 5ms overhead

        // NUMA penalty when crossing nodes
        const numaNodes = Math.ceil(batchSize / (maxThreads / this.spec.numaNodes));
        const numaPenalty = (numaNodes - 1) * 2;

        const totalLatency = computeMs + cacheMs + numaPenalty;

        return {
            latencyMs: totalLatency,
            breakdown: { computeMs, cacheMs },
        };
    }

    // Check if CPU can handle request within SLO
    canMeetSLO(sloMs: number, complexity: number, batchSize: number): boolean {
        const { latencyMs } = this.calculateLatency(complexity, batchSize);
        return latencyMs <= sloMs;
    }

    // Allocate threads
    allocate(batchSize: number): boolean {
        const maxThreads = this.spec.cores * this.spec.threadsPerCore;
        const threadsNeeded = Math.min(batchSize * 2, maxThreads);

        if (this.activeThreads + threadsNeeded > maxThreads * 0.95) {
            return false;
        }

        this.activeThreads += threadsNeeded;
        this.updateUtilization();
        return true;
    }

    release(batchSize: number): void {
        const maxThreads = this.spec.cores * this.spec.threadsPerCore;
        const threadsReleased = Math.min(batchSize * 2, maxThreads);
        this.activeThreads = Math.max(0, this.activeThreads - threadsReleased);
        this.updateUtilization();
    }

    private updateUtilization(): void {
        const maxThreads = this.spec.cores * this.spec.threadsPerCore;
        this.utilization = this.activeThreads / maxThreads;
    }

    getCost(latencyMs: number): number {
        return (latencyMs / 1000) * this.spec.costPerSecond;
    }

    getState(): { cpuUtilization: number; activeThreads: number } {
        return {
            cpuUtilization: this.utilization,
            activeThreads: this.activeThreads,
        };
    }

    getSpec(): CPUSpec {
        return this.spec;
    }

    reset(): void {
        this.utilization = 0;
        this.activeThreads = 0;
    }
}
