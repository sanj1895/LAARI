// Demo simulation scenarios and main simulation loop

import type {
    InferenceRequest,
    InferenceResult,
    RequestPriority,
    RequestType,
    SystemMetrics
} from './types';
import { InferenceScheduler } from './scheduler';

// Scenario types
export type ScenarioType = 'normal' | 'volatility_spike' | 'sustained_pressure' | 'flash_crash';

export interface ScenarioConfig {
    name: string;
    description: string;
    baseRPS: number;           // Base requests per second
    spikeMultiplier: number;   // Multiplier during spike
    spikeDurationMs: number;   // How long spike lasts
    spikeIntervalMs: number;   // Time between spikes
    priorityDistribution: Record<RequestPriority, number>;
    typeDistribution: Record<RequestType, number>;
}

export const SCENARIOS: Record<ScenarioType, ScenarioConfig> = {
    normal: {
        name: 'Normal Market',
        description: 'Steady request flow, typical trading day',
        baseRPS: 100,
        spikeMultiplier: 1.2,
        spikeDurationMs: 0,
        spikeIntervalMs: 0,
        priorityDistribution: { critical: 0.05, high: 0.2, medium: 0.5, low: 0.25 },
        typeDistribution: { risk_check: 0.3, pricing: 0.4, fraud_detection: 0.2, compliance: 0.1 },
    },
    volatility_spike: {
        name: 'Volatility Spike',
        description: '5× request surge - Fed announcement, earnings, etc.',
        baseRPS: 100,
        spikeMultiplier: 5,
        spikeDurationMs: 10000,
        spikeIntervalMs: 30000,
        priorityDistribution: { critical: 0.15, high: 0.35, medium: 0.35, low: 0.15 },
        typeDistribution: { risk_check: 0.5, pricing: 0.35, fraud_detection: 0.1, compliance: 0.05 },
    },
    sustained_pressure: {
        name: 'Sustained Pressure',
        description: 'Extended high-load period',
        baseRPS: 200,
        spikeMultiplier: 3,
        spikeDurationMs: 30000,
        spikeIntervalMs: 60000,
        priorityDistribution: { critical: 0.1, high: 0.3, medium: 0.4, low: 0.2 },
        typeDistribution: { risk_check: 0.4, pricing: 0.35, fraud_detection: 0.15, compliance: 0.1 },
    },
    flash_crash: {
        name: 'Flash Crash',
        description: 'Extreme volatility event - all hands on deck',
        baseRPS: 150,
        spikeMultiplier: 10,
        spikeDurationMs: 5000,
        spikeIntervalMs: 60000,
        priorityDistribution: { critical: 0.4, high: 0.35, medium: 0.2, low: 0.05 },
        typeDistribution: { risk_check: 0.6, pricing: 0.25, fraud_detection: 0.1, compliance: 0.05 },
    },
};

// Generate a random request based on scenario config
function generateRequest(
    id: string,
    config: ScenarioConfig,
    isSpike: boolean
): InferenceRequest {
    // Sample priority
    const rand = Math.random();
    let cumulative = 0;
    let priority: RequestPriority = 'medium';
    for (const [p, prob] of Object.entries(config.priorityDistribution)) {
        cumulative += prob;
        if (rand < cumulative) {
            priority = p as RequestPriority;
            break;
        }
    }

    // Sample type
    const rand2 = Math.random();
    cumulative = 0;
    let type: RequestType = 'pricing';
    for (const [t, prob] of Object.entries(config.typeDistribution)) {
        cumulative += prob;
        if (rand2 < cumulative) {
            type = t as RequestType;
            break;
        }
    }

    // During spikes, more critical/high priority and tighter SLOs
    const sloMultiplier = isSpike ? 0.8 : 1.0;
    const baseSLO: Record<RequestPriority, number> = {
        critical: 5,
        high: 10,
        medium: 20,
        low: 50,
    };

    return {
        id,
        type,
        priority,
        sloMs: baseSLO[priority] * sloMultiplier,
        timestamp: Date.now(),
        payload: {
            complexity: 0.3 + Math.random() * 0.5, // 0.3-0.8
            tokenCount: 50 + Math.floor(Math.random() * 200), // 50-250 tokens
        },
    };
}

// Simulation state
export interface SimulationState {
    isRunning: boolean;
    scenario: ScenarioType;
    currentRPS: number;
    isInSpike: boolean;
    timeElapsedMs: number;
    results: InferenceResult[];
    metrics: SystemMetrics;
    schedulingDecisions: Array<{
        decision: ReturnType<InferenceScheduler['makeDecision']>;
        result: InferenceResult;
    }>;
}

// Main simulation controller
export class SimulationController {
    private scheduler: InferenceScheduler;
    private naiveScheduler: InferenceScheduler; // For comparison
    private state: SimulationState;
    private intervalId: number | null = null;
    private requestCounter: number = 0;
    private listeners: Set<(state: SimulationState) => void> = new Set();

    constructor() {
        this.scheduler = new InferenceScheduler();
        this.naiveScheduler = new InferenceScheduler(undefined, undefined, undefined, {
            enableCPUFallback: false,
            adaptiveQuantization: false,
        });
        this.state = this.createInitialState();
    }

    private createInitialState(): SimulationState {
        return {
            isRunning: false,
            scenario: 'normal',
            currentRPS: 0,
            isInSpike: false,
            timeElapsedMs: 0,
            results: [],
            metrics: {
                timestamp: Date.now(),
                requestsPerSecond: 0,
                p50LatencyMs: 0,
                p95LatencyMs: 0,
                p99LatencyMs: 0,
                sloViolationRate: 0,
                gpuCost: 0,
                cpuCost: 0,
                totalCost: 0,
                riskExposure: 0,
            },
            schedulingDecisions: [],
        };
    }

    setScenario(scenario: ScenarioType): void {
        this.state.scenario = scenario;
        this.notifyListeners();
    }

    start(): void {
        if (this.state.isRunning) return;

        this.state.isRunning = true;
        const startTime = Date.now();
        let lastSpikeTime = 0;

        // Run simulation tick every 100ms
        this.intervalId = window.setInterval(() => {
            const config = SCENARIOS[this.state.scenario];
            const elapsed = Date.now() - startTime;
            this.state.timeElapsedMs = elapsed;

            // Check for spike
            const timeSinceLastSpike = elapsed - lastSpikeTime;
            const wasInSpike = this.state.isInSpike;

            if (config.spikeIntervalMs > 0) {
                if (timeSinceLastSpike >= config.spikeIntervalMs && !this.state.isInSpike) {
                    this.state.isInSpike = true;
                    lastSpikeTime = elapsed;
                } else if (this.state.isInSpike && timeSinceLastSpike >= config.spikeDurationMs) {
                    this.state.isInSpike = false;
                }
            }

            // Calculate current RPS
            const multiplier = this.state.isInSpike ? config.spikeMultiplier : 1;
            this.state.currentRPS = config.baseRPS * multiplier;

            // Generate requests for this tick (100ms = 0.1s)
            const requestsThisTick = Math.floor(this.state.currentRPS * 0.1);

            for (let i = 0; i < requestsThisTick; i++) {
                const request = generateRequest(
                    `req-${this.requestCounter++}`,
                    config,
                    this.state.isInSpike
                );

                // Make decision and execute
                const decision = this.scheduler.makeDecision(request);
                const result = this.scheduler.executeRequest(request, decision);

                this.state.results.push(result);
                this.state.schedulingDecisions.push({ decision, result });

                // Keep only last 100 for display
                if (this.state.results.length > 100) {
                    this.state.results = this.state.results.slice(-100);
                    this.state.schedulingDecisions = this.state.schedulingDecisions.slice(-100);
                }
            }

            // Update metrics
            this.state.metrics = this.scheduler.getSystemMetrics();
            this.notifyListeners();
        }, 100);

        this.notifyListeners();
    }

    stop(): void {
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.state.isRunning = false;
        this.notifyListeners();
    }

    reset(): void {
        this.stop();
        this.scheduler.reset();
        this.naiveScheduler.reset();
        this.requestCounter = 0;
        this.state = this.createInitialState();
        this.notifyListeners();
    }

    getState(): SimulationState {
        return this.state;
    }

    getScheduler(): InferenceScheduler {
        return this.scheduler;
    }

    getNaiveScheduler(): InferenceScheduler {
        return this.naiveScheduler;
    }

    subscribe(listener: (state: SimulationState) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        this.listeners.forEach(listener => listener(this.state));
    }
}

// Singleton instance
let simulationInstance: SimulationController | null = null;

export function getSimulation(): SimulationController {
    if (!simulationInstance) {
        simulationInstance = new SimulationController();
    }
    return simulationInstance;
}
