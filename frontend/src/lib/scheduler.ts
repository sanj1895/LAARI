// Hardware-aware scheduler with adaptive batching and SLO guarantees

import type {
    InferenceRequest,
    InferenceResult,
    SchedulingDecision,
    QuantizationType,
    SystemMetrics
} from './types';
import { GPUSimulator } from './hardware/gpu';
import { CPUSimulator } from './hardware/cpu';
import { CostModel, RiskCalculator } from './finance/costModel';

export interface SchedulerConfig {
    maxQueueSize: number;
    maxBatchWaitMs: number;
    targetP99Percentile: number;
    enableCPUFallback: boolean;
    adaptiveQuantization: boolean;
}

const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
    maxQueueSize: 1000,
    maxBatchWaitMs: 5,
    targetP99Percentile: 0.99,
    enableCPUFallback: true,
    adaptiveQuantization: true,
};

export class InferenceScheduler {
    private gpu: GPUSimulator;
    private cpu: CPUSimulator;
    private costModel: CostModel;
    private riskCalculator: RiskCalculator;
    private config: SchedulerConfig;

    // Queue and metrics
    private queue: InferenceRequest[] = [];
    private latencyHistory: number[] = [];
    private metricsHistory: SystemMetrics[] = [];
    private totalRequests: number = 0;
    private totalCost: number = 0;

    constructor(
        gpu: GPUSimulator = new GPUSimulator(),
        cpu: CPUSimulator = new CPUSimulator(),
        costModel: CostModel = new CostModel(),
        config: Partial<SchedulerConfig> = {}
    ) {
        this.gpu = gpu;
        this.cpu = cpu;
        this.costModel = costModel;
        this.riskCalculator = new RiskCalculator();
        this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    }

    // Make scheduling decision for a request
    makeDecision(request: InferenceRequest): SchedulingDecision {
        const gpuState = this.gpu.getState();
        const cpuState = this.cpu.getState();

        // Available quantization options
        const quantOptions: QuantizationType[] = this.config.adaptiveQuantization
            ? ['FP16', 'INT8', 'INT4']
            : ['FP16'];

        // Collect all viable options
        const options: Array<{
            hardware: 'gpu' | 'cpu';
            quantization: QuantizationType;
            estimatedLatencyMs: number;
            batchSize: number;
        }> = [];

        // Check GPU options
        for (const quant of quantOptions) {
            const optimalBatch = this.gpu.getOptimalBatchSize(request.sloMs, request.payload.complexity, quant);
            const { latencyMs } = this.gpu.calculateLatency(
                optimalBatch,
                request.payload.complexity,
                quant,
                request.payload.tokenCount
            );

            if (latencyMs <= request.sloMs) {
                options.push({
                    hardware: 'gpu',
                    quantization: quant,
                    estimatedLatencyMs: latencyMs,
                    batchSize: optimalBatch,
                });
            }
        }

        // Check CPU fallback for low priority
        if (
            this.config.enableCPUFallback &&
            (request.priority === 'low' || request.priority === 'medium' || (gpuState.gpuUtilization ?? 0) > 0.9)
        ) {
            const { latencyMs } = this.cpu.calculateLatency(request.payload.complexity, 1);
            if (latencyMs <= request.sloMs || options.length === 0) {
                options.push({
                    hardware: 'cpu',
                    quantization: 'FP32', // CPU doesn't use quantization in this model
                    estimatedLatencyMs: latencyMs,
                    batchSize: 1,
                });
            }
        }

        // Find optimal option using cost model
        const optimal = this.costModel.findOptimalOption(options, {
            sloMs: request.sloMs,
            priority: request.priority,
            requestType: request.type,
        });

        if (optimal) {
            return {
                requestId: request.id,
                hardware: optimal.option.hardware,
                modelVariant: optimal.option.quantization,
                batchSize: optimal.option.batchSize,
                estimatedLatencyMs: optimal.option.estimatedLatencyMs,
                estimatedCost: optimal.cost.totalCost,
                reason: this.generateReason(optimal, request, gpuState),
            };
        }

        // Fallback: use GPU with most aggressive quantization
        const fallbackLatency = this.gpu.calculateLatency(
            1,
            request.payload.complexity,
            'INT4',
            request.payload.tokenCount
        );

        return {
            requestId: request.id,
            hardware: 'gpu',
            modelVariant: 'INT4',
            batchSize: 1,
            estimatedLatencyMs: fallbackLatency.latencyMs,
            estimatedCost: 999,
            reason: 'Fallback: no viable option within SLO, using aggressive quantization',
        };
    }

    private generateReason(
        optimal: NonNullable<ReturnType<CostModel['findOptimalOption']>>,
        request: InferenceRequest,
        gpuState: Partial<ReturnType<GPUSimulator['getState']>>
    ): string {
        const parts: string[] = [];

        if (optimal.option.hardware === 'cpu') {
            parts.push('Routed to CPU (low priority or GPU under pressure)');
        } else {
            parts.push(`GPU with ${optimal.option.quantization}`);
        }

        if (optimal.option.quantization !== 'FP16') {
            parts.push(`quantized for ${request.sloMs}ms SLO`);
        }

        if ((gpuState.gpuUtilization ?? 0) > 0.8) {
            parts.push(`GPU at ${Math.round((gpuState.gpuUtilization ?? 0) * 100)}% util`);
        }

        parts.push(`batch=${optimal.option.batchSize}`);

        return parts.join(', ');
    }

    // Execute request based on decision
    executeRequest(request: InferenceRequest, decision: SchedulingDecision): InferenceResult {
        const startTime = Date.now();
        let actualLatencyMs: number;
        let cost: number;

        if (decision.hardware === 'gpu') {
            // Allocate GPU resources
            this.gpu.allocate(decision.batchSize, request.payload.tokenCount, decision.modelVariant);

            // Calculate actual latency with some variance
            const variance = 0.9 + Math.random() * 0.2;
            const { latencyMs, computeMs, memoryMs } = this.gpu.calculateLatency(
                decision.batchSize,
                request.payload.complexity,
                decision.modelVariant,
                request.payload.tokenCount
            );
            actualLatencyMs = latencyMs * variance;
            cost = this.gpu.getCost(actualLatencyMs);

            // Release resources
            this.gpu.release(decision.batchSize, request.payload.tokenCount, decision.modelVariant);

            const sloMet = actualLatencyMs <= request.sloMs;
            if (!sloMet) {
                this.riskCalculator.recordViolation(request.priority);
            }

            this.recordMetrics(actualLatencyMs, cost);

            return {
                id: request.id,
                requestId: request.id,
                latencyMs: actualLatencyMs,
                hardware: 'gpu',
                modelVariant: decision.modelVariant,
                batchSize: decision.batchSize,
                sloMet,
                sloViolated: !sloMet,
                cost,
                breakdown: {
                    queueTimeMs: 0,
                    computeTimeMs: computeMs * variance,
                    memoryTimeMs: memoryMs * variance,
                    computeMs: computeMs * variance,
                    memoryMs: memoryMs * variance,
                },
            };
        } else {
            // CPU path
            this.cpu.allocate(decision.batchSize);

            const variance = 0.9 + Math.random() * 0.2;
            const { latencyMs, breakdown } = this.cpu.calculateLatency(request.payload.complexity, decision.batchSize);
            actualLatencyMs = latencyMs * variance;
            cost = this.cpu.getCost(actualLatencyMs);

            this.cpu.release(decision.batchSize);

            const sloMet = actualLatencyMs <= request.sloMs;
            if (!sloMet) {
                this.riskCalculator.recordViolation(request.priority);
            }

            this.recordMetrics(actualLatencyMs, cost);

            return {
                id: request.id,
                requestId: request.id,
                latencyMs: actualLatencyMs,
                hardware: 'cpu',
                modelVariant: 'FP32',
                batchSize: decision.batchSize,
                sloMet,
                sloViolated: !sloMet,
                cost,
                breakdown: {
                    queueTimeMs: 0,
                    computeTimeMs: breakdown.computeMs * variance,
                    memoryTimeMs: breakdown.cacheMs * variance,
                    computeMs: breakdown.computeMs * variance,
                    memoryMs: breakdown.cacheMs * variance,
                },
            };
        }
    }

    private recordMetrics(latencyMs: number, cost: number): void {
        this.latencyHistory.push(latencyMs);
        this.totalRequests++;
        this.totalCost += cost;

        // Keep only last 1000 for percentile calculations
        if (this.latencyHistory.length > 1000) {
            this.latencyHistory = this.latencyHistory.slice(-1000);
        }
    }

    // Calculate latency percentiles
    getLatencyPercentiles(): { p50: number; p95: number; p99: number } {
        if (this.latencyHistory.length === 0) {
            return { p50: 0, p95: 0, p99: 0 };
        }

        const sorted = [...this.latencyHistory].sort((a, b) => a - b);
        const p50Index = Math.floor(sorted.length * 0.5);
        const p95Index = Math.floor(sorted.length * 0.95);
        const p99Index = Math.floor(sorted.length * 0.99);

        return {
            p50: sorted[p50Index] || 0,
            p95: sorted[p95Index] || 0,
            p99: sorted[p99Index] || 0,
        };
    }

    getSystemMetrics(): SystemMetrics {
        const percentiles = this.getLatencyPercentiles();
        const gpuState = this.gpu.getState();
        const cpuState = this.cpu.getState();

        return {
            timestamp: Date.now(),
            requestsPerSecond: this.totalRequests,
            p50LatencyMs: percentiles.p50,
            p95LatencyMs: percentiles.p95,
            p99LatencyMs: percentiles.p99,
            sloViolationRate: this.riskCalculator.getViolationRate(),
            gpuCost: this.totalCost * 0.8, // Approximate split
            cpuCost: this.totalCost * 0.2,
            totalCost: this.totalCost,
            riskExposure: this.riskCalculator.calculateExposure(this.costModel.getConfig()),
        };
    }

    getGPU(): GPUSimulator {
        return this.gpu;
    }

    getCPU(): CPUSimulator {
        return this.cpu;
    }

    getRiskCalculator(): RiskCalculator {
        return this.riskCalculator;
    }

    reset(): void {
        this.gpu.reset();
        this.cpu.reset();
        this.riskCalculator.reset();
        this.queue = [];
        this.latencyHistory = [];
        this.metricsHistory = [];
        this.totalRequests = 0;
        this.totalCost = 0;
    }
}
