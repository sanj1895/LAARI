import { getWebGPU, WebGPUCompute } from './webgpu';
import { getMarketData, MarketDataService, type VolatilityMetrics } from './marketData';
import { getOllama, OllamaService, type OllamaMetrics } from './ollama';
import { getCloud, MultiCloudService, type CloudMetrics } from './cloud';
import type { SystemMetrics, InferenceResult } from './types';

type BackendMetrics = {
    p50: number;
    p99: number;
    sloViolationRate: number;
    sampleCount: number;
};

async function fetchBackendMetrics(): Promise<BackendMetrics> {
    const res = await fetch("http://localhost:5050/api/metrics");

    if (!res.ok) {
        throw new Error("Failed to fetch backend metrics");
    }

    return res.json();
}

export interface RealTimeState {
    isRunning: boolean;
    isAutoPilot: boolean;
    volatility: VolatilityMetrics | null;
    ollamaMetrics: OllamaMetrics | null;
    webGPUMetrics: any | null;
    cloudMetrics: CloudMetrics | null;
    metrics: SystemMetrics;
    recentResults: InferenceResult[];
    lastAction: string;
    localSavings: number;
    cloudCost: number;
}

export class RealTimeController {
    private marketData: MarketDataService;
    private webGPU: WebGPUCompute | null = null;
    private ollama: OllamaService;
    private cloud: MultiCloudService;
    private state: RealTimeState;
    private listeners: Set<(state: RealTimeState) => void> = new Set();
    private backendPollInterval: number | null = null;
    private recentRequestTimestamps: number[] = [];

    constructor() {
        this.marketData = getMarketData();
        this.ollama = getOllama();
        this.cloud = getCloud();
        this.state = this.createInitialState();

        // Initialize WebGPU
        getWebGPU().then(gpu => {
            this.webGPU = gpu;
        });

        // Subscribe to market data
        this.marketData.subscribe((v: VolatilityMetrics) => {
            // Don't overwrite if a demo is actively forcing a spike
            if (this.demoIntervalId !== null && this.state.volatility?.isSpike) return;

            // Add a tiny bit of simulated jitter so the UI feels alive even if real data is flat
            const jitter = (Math.random() * 0.02);
            const adjustedVolatility = {
                ...v,
                currentVolatility: v.currentVolatility === 0 ? jitter : v.currentVolatility
            };
            this.state.volatility = adjustedVolatility;
            if (this.state.isAutoPilot && adjustedVolatility.isSpike) {
                this.handleVolatilitySpike(adjustedVolatility);
            }
            this.notifyListeners();
        });
    }

    private createInitialState(): RealTimeState {
        return {
            isRunning: false,
            isAutoPilot: true,
            volatility: null,
            ollamaMetrics: null,
            webGPUMetrics: null,
            cloudMetrics: null,
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
            recentResults: [],
            lastAction: 'System Initialized. Waiting for market data...',
            localSavings: 0,
            cloudCost: 0,
        };
    }

    private resetState() {
        const fresh = this.createInitialState();
        fresh.isAutoPilot = this.state.isAutoPilot;
        this.state = fresh;
    }

    async start() {
        if (this.state.isRunning) return;

        // 🔑 Tell backend to start monitoring
        await fetch("http://localhost:5050/api/monitoring/start", {
            method: "POST"
        });

        this.state.isRunning = true;
        this.state.lastAction = 'Real-time monitoring started.';
        this.marketData.startPolling(10000);

        this.backendPollInterval = window.setInterval(async () => {
            try {
                const backend = await fetchBackendMetrics();

                this.state.metrics.p50LatencyMs = backend.p50;
                this.state.metrics.p99LatencyMs = backend.p99;
                this.state.metrics.sloViolationRate = backend.sloViolationRate;

                this.state.lastAction =
                    `Backend metrics updated (${backend.sampleCount} samples)`;

                this.notifyListeners();
            } catch (err) {
                console.error("Backend metrics fetch failed:", err);
            }
        }, 1000);

        this.notifyListeners();
    }

    private downloadSessionHTML() {
        const link = document.createElement("a");
        link.href = "http://localhost:5050/api/export/combined.html";
        link.download = "session_metrics.html";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async stop() {
        if (!this.state.isRunning) return;


        // 2. Stop backend monitoring + wipe backend memory
        try {
            await fetch("http://localhost:5050/api/monitoring/stop", {
                method: "POST",
            });
        } catch (err) {
            console.error("Failed to reset backend state:", err);
        }

        // 3. Stop all frontend polling / intervals
        this.marketData.stopPolling();

        if (this.backendPollInterval !== null) {
            clearInterval(this.backendPollInterval);
            this.backendPollInterval = null;
        }

        if (this.demoIntervalId !== null) {
            clearInterval(this.demoIntervalId);
            this.demoIntervalId = null;
        }

        // 4. HARD RESET frontend state (this clears graph + UI)
        this.resetState();

        // 5. Final UI message
        this.state.lastAction = "System terminated. Ready to initialize.";
        this.notifyListeners();
    }



    toggleAutoPilot() {
        this.state.isAutoPilot = !this.state.isAutoPilot;
        this.state.lastAction = `Auto-Pilot ${this.state.isAutoPilot ? 'Enabled' : 'Disabled'}.`;
        this.notifyListeners();
    }

    async runOllamaInference(prompt: string = "Analyze current market risk.") {
        this.state.lastAction = "Routing Inference...";
        this.notifyListeners();

        // COST OPTIMIZATION LOGIC:
        // 1. Try local Ollama first (Free)
        // 2. If local fails or latency is too high during spike, fallback to Real Multi-Cloud

        // Try local first
        const metrics = await this.ollama.generate(prompt);

        if (metrics) {
            this.state.ollamaMetrics = metrics;
            this.state.lastAction = `Local Inference (Free): ${metrics.tps.toFixed(1)} tps`;
            this.state.localSavings += 0.002; // Saved $0.002 vs Cloud

            this.recordResult({
                id: `local-${Date.now()}`,
                latencyMs: metrics.totalLatencyMs,
                provider: 'LOCAL',
                cost: 0, // Local is free
                sloViolated: metrics.totalLatencyMs > 5000,
                breakdown: { computeMs: metrics.totalLatencyMs, memoryMs: 0 }
            });
        } else {
            // Fallback to Real Multi-Cloud
            this.state.lastAction = `Local Failed. Routing to Multi-Cloud...`;
            this.notifyListeners();

            const cloudResult = await this.cloud.invokeModel(prompt);
            this.state.cloudMetrics = cloudResult;

            if (cloudResult) {
                this.state.lastAction = `Cloud Fallback (${cloudResult.provider}): ${cloudResult.latencyMs.toFixed(0)}ms`;
                this.state.cloudCost += cloudResult.cost;

                this.recordResult({
                    id: `${cloudResult.provider.toLowerCase()}-${Date.now()}`,
                    latencyMs: cloudResult.latencyMs,
                    provider: 'CLOUD',
                    cost: cloudResult.cost,
                    sloViolated: cloudResult.latencyMs > 2000,
                    breakdown: { computeMs: cloudResult.latencyMs, memoryMs: 0 }
                });
            } else {
                this.state.lastAction = "All inference paths failed. Check API keys.";
            }
        }
        this.notifyListeners();
    }

    async runWebGPUMonteCarlo(samples: number = 1000000) {
        if (!this.webGPU) return;

        this.state.lastAction = `Running WebGPU Monte Carlo (${samples} samples)...`;
        this.notifyListeners();

        const result = await this.webGPU.runMonteCarlo(samples);
        this.state.webGPUMetrics = result;

        if (result) {
            this.state.lastAction = `WebGPU Monte Carlo Complete: ${result.latencyMs.toFixed(2)}ms`;
            this.state.localSavings += 0.0005; // Saved vs cloud compute

            this.recordResult({
                id: `webgpu-${Date.now()}`,
                latencyMs: result.latencyMs,
                provider: 'LOCAL',
                cost: 0,
                sloViolated: result.latencyMs > 100,
                breakdown: { computeMs: result.latencyMs, memoryMs: 0 }
            });
        }
        this.notifyListeners();
    }

    private handleVolatilitySpike(v: VolatilityMetrics) {
        this.state.lastAction = `⚠ VOLATILITY SPIKE: ${v.spikeReason}. Optimizing routing...`;

        // During spikes, we run a critical risk check on Cloud to ensure reliability
        // while keeping non-critical pricing on local WebGPU
        this.runWebGPUMonteCarlo(250000); // Fast local check

        if (this.state.isAutoPilot) {
            this.runOllamaInference("CRITICAL: Analyze volatility spike impact.");
        }
    }

    private recordResult(result: InferenceResult) {
        this.state.recentResults.unshift(result);
        if (this.state.recentResults.length > 20) {
            this.state.recentResults.pop();
        }

        // Track throughput (RPS)
        const now = Date.now();
        this.recentRequestTimestamps.push(now);
        this.recentRequestTimestamps = this.recentRequestTimestamps.filter(t => now - t < 5000); // 5s window
        const rps = this.recentRequestTimestamps.length / 5;

        const latencies = this.state.recentResults.map(r => r.latencyMs);
        latencies.sort((a, b) => a - b);

        this.state.metrics = {
            ...this.state.metrics,
            timestamp: Date.now(),
            requestsPerSecond: rps,
            p50LatencyMs: latencies[Math.floor(latencies.length * 0.5)] || 0,
            p99LatencyMs: latencies[Math.floor(latencies.length * 0.99)] || 0,
            totalCost: this.state.cloudCost,
            sloViolationRate: this.state.recentResults.filter(r => r.sloViolated).length / this.state.recentResults.length
        };
    }

    private demoIntervalId: number | null = null;

    async runDemoSteadyState() {
        this.stopDemo();
        this.state.lastAction = "DEMO START: Steady-State (Local Priority)";
        this.notifyListeners();

        let count = 0;
        this.demoIntervalId = window.setInterval(async () => {
            if (count >= 15) { // Run for ~15-30s
                this.stopDemo();
                return;
            }
            await this.runWebGPUMonteCarlo(1000000);
            if (count % 3 === 0) await this.runOllamaInference("Steady state risk check.");
            count++;
        }, 2000);
    }

    async runDemoVolatilitySpike() {
        this.stopDemo();
        this.state.lastAction = "DEMO START: Volatility Spike (Cloud Fallback)";
        this.notifyListeners();

        // 1. Trigger a spike
        const spike: VolatilityMetrics = {
            currentVolatility: 0.85,
            isSpike: true,
            spikeReason: "DEMO: Flash Crash Simulation",
            priceChanges: []
        };
        this.state.volatility = spike;

        let count = 0;
        this.demoIntervalId = window.setInterval(async () => {
            if (count >= 10) {
                this.stopDemo();
                return;
            }

            // Force Cloud routing by temporarily disabling local Ollama
            const originalOllama = this.ollama;
            // @ts-ignore - Mocking failure for demo
            this.ollama = { generate: async () => null };

            await this.runOllamaInference("CRITICAL: Market crash detected!");

            // Restore
            this.ollama = originalOllama;
            count++;
        }, 3000);
    }

    stopDemo() {
        if (this.demoIntervalId) {
            clearInterval(this.demoIntervalId);
            this.demoIntervalId = null;
            this.state.lastAction = "Demo Completed.";
            this.notifyListeners();
        }
    }

    getState(): RealTimeState {
        return this.state;
    }

    subscribe(listener: (state: RealTimeState) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        this.listeners.forEach(listener => listener(this.state));
    }
}

let realTimeInstance: RealTimeController | null = null;

export function getRealTimeController(): RealTimeController {
    if (!realTimeInstance) {
        realTimeInstance = new RealTimeController();
    }
    return realTimeInstance;
}
