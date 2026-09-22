// Financial cost model and risk calculator

import type { QuantizationType, RequestPriority, RequestType } from '../types';

// Cost configuration
export interface CostConfig {
    gpuCostPerSecond: number;
    cpuCostPerSecond: number;
    sloViolationPenalty: {
        critical: number;
        high: number;
        medium: number;
        low: number;
    };
    accuracyPenalty: {
        // Penalty for using lower accuracy models
        FP32: number;
        FP16: number;
        INT8: number;
        INT4: number;
    };
}

export const DEFAULT_COST_CONFIG: CostConfig = {
    gpuCostPerSecond: 0.0031,  // ~$11/hour
    cpuCostPerSecond: 0.0008,  // ~$3/hour
    sloViolationPenalty: {
        critical: 1000,  // $1000 per violation
        high: 100,
        medium: 10,
        low: 1,
    },
    accuracyPenalty: {
        FP32: 0,
        FP16: 0.01,   // Minimal penalty, nearly same accuracy
        INT8: 0.10,   // Small penalty
        INT4: 0.50,   // Larger penalty for aggressive quantization
    },
};

export class CostModel {
    private config: CostConfig;

    constructor(config: CostConfig = DEFAULT_COST_CONFIG) {
        this.config = config;
    }

    // Calculate expected compute cost
    calculateComputeCost(
        latencyMs: number,
        hardware: 'gpu' | 'cpu'
    ): number {
        const costPerSecond = hardware === 'gpu'
            ? this.config.gpuCostPerSecond
            : this.config.cpuCostPerSecond;
        return (latencyMs / 1000) * costPerSecond;
    }

    // Calculate risk cost from potential SLO violation
    calculateRiskCost(
        estimatedLatencyMs: number,
        sloMs: number,
        priority: RequestPriority,
        sloViolationProbability?: number
    ): number {
        // If latency estimate exceeds SLO, calculate expected loss
        const violationPenalty = this.config.sloViolationPenalty[priority];

        if (sloViolationProbability !== undefined) {
            // Use provided probability
            return violationPenalty * sloViolationProbability;
        }

        // Estimate probability based on how close we are to SLO
        const margin = (sloMs - estimatedLatencyMs) / sloMs;

        if (margin < 0) {
            // Already over SLO
            return violationPenalty;
        } else if (margin < 0.1) {
            // Very tight margin, high risk
            return violationPenalty * 0.5;
        } else if (margin < 0.2) {
            return violationPenalty * 0.2;
        } else if (margin < 0.3) {
            return violationPenalty * 0.1;
        }
        return 0;
    }

    // Calculate accuracy penalty for using quantized models
    calculateAccuracyPenalty(
        quantization: QuantizationType,
        requestType: RequestType
    ): number {
        const basePenalty = this.config.accuracyPenalty[quantization];

        // Some request types are more sensitive to accuracy
        const typeSensitivity: Record<RequestType, number> = {
            risk_check: 2.0,      // Risk calculations need accuracy
            pricing: 1.5,         // Pricing matters
            fraud_detection: 1.0, // Can tolerate some loss
            compliance: 1.2,      // Moderate sensitivity
        };

        return basePenalty * typeSensitivity[requestType];
    }

    // Total cost calculation
    calculateTotalCost(params: {
        latencyMs: number;
        sloMs: number;
        hardware: 'gpu' | 'cpu';
        priority: RequestPriority;
        quantization: QuantizationType;
        requestType: RequestType;
    }): {
        computeCost: number;
        riskCost: number;
        accuracyPenalty: number;
        totalCost: number;
        breakdown: string;
    } {
        const computeCost = this.calculateComputeCost(params.latencyMs, params.hardware);
        const riskCost = this.calculateRiskCost(params.latencyMs, params.sloMs, params.priority);
        const accuracyPenalty = this.calculateAccuracyPenalty(params.quantization, params.requestType);

        const totalCost = computeCost + riskCost + accuracyPenalty;

        return {
            computeCost,
            riskCost,
            accuracyPenalty,
            totalCost,
            breakdown: `Compute: $${computeCost.toFixed(6)} | Risk: $${riskCost.toFixed(2)} | Accuracy: $${accuracyPenalty.toFixed(2)}`,
        };
    }

    // Compare options and find lowest total cost
    findOptimalOption(options: Array<{
        hardware: 'gpu' | 'cpu';
        quantization: QuantizationType;
        estimatedLatencyMs: number;
        batchSize: number;
    }>, request: {
        sloMs: number;
        priority: RequestPriority;
        requestType: RequestType;
    }): {
        optimalIndex: number;
        option: typeof options[0];
        cost: ReturnType<CostModel['calculateTotalCost']>;
    } | null {
        let bestOption: typeof options[0] | null = null;
        let bestCost: ReturnType<CostModel['calculateTotalCost']> | null = null;
        let bestIndex = -1;

        for (let i = 0; i < options.length; i++) {
            const opt = options[i];
            const cost = this.calculateTotalCost({
                latencyMs: opt.estimatedLatencyMs,
                sloMs: request.sloMs,
                hardware: opt.hardware,
                priority: request.priority,
                quantization: opt.quantization,
                requestType: request.requestType,
            });

            if (bestCost === null || cost.totalCost < bestCost.totalCost) {
                bestOption = opt;
                bestCost = cost;
                bestIndex = i;
            }
        }

        if (bestOption && bestCost) {
            return { optimalIndex: bestIndex, option: bestOption, cost: bestCost };
        }
        return null;
    }

    getConfig(): CostConfig {
        return this.config;
    }
}

// Risk exposure calculator
export class RiskCalculator {
    private violationHistory: Array<{ timestamp: number; priority: RequestPriority }> = [];
    private windowMs: number = 60000; // 1 minute window

    recordViolation(priority: RequestPriority): void {
        this.violationHistory.push({ timestamp: Date.now(), priority });
        this.pruneOldViolations();
    }

    private pruneOldViolations(): void {
        const cutoff = Date.now() - this.windowMs;
        this.violationHistory = this.violationHistory.filter(v => v.timestamp > cutoff);
    }

    // Calculate current risk exposure
    calculateExposure(costConfig: CostConfig): number {
        this.pruneOldViolations();
        return this.violationHistory.reduce((total, v) => {
            return total + costConfig.sloViolationPenalty[v.priority];
        }, 0);
    }

    getViolationRate(): number {
        this.pruneOldViolations();
        return this.violationHistory.length;
    }

    getViolationsByPriority(): Record<RequestPriority, number> {
        this.pruneOldViolations();
        const counts: Record<RequestPriority, number> = {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
        };
        this.violationHistory.forEach(v => counts[v.priority]++);
        return counts;
    }

    reset(): void {
        this.violationHistory = [];
    }
}
