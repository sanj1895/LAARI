export interface AWSMetrics {
    latencyMs: number;
    cost: number;
    model: string;
    type: 'Spot' | 'On-Demand';
}

export interface AWSPricing {
    spot: number;
    onDemand: number;
}

export class AWSService {
    private pricing: AWSPricing = {
        spot: 0.0005, // $/inference
        onDemand: 0.002, // $/inference
    };

    async invokeModel(prompt: string, priority: 'critical' | 'normal' = 'normal'): Promise<AWSMetrics | null> {
        const startTime = performance.now();

        // Simulate network latency to AWS (50ms - 200ms)
        const networkLatency = 50 + Math.random() * 150;
        await new Promise(resolve => setTimeout(resolve, networkLatency));

        const type = priority === 'critical' ? 'On-Demand' : 'Spot';
        const cost = type === 'On-Demand' ? this.pricing.onDemand : this.pricing.spot;

        const endTime = performance.now();

        return {
            latencyMs: endTime - startTime,
            cost,
            model: 'Claude-3-Haiku',
            type
        };
    }

    getPricing(): AWSPricing {
        return this.pricing;
    }

    async checkConnectivity(): Promise<boolean> {
        // Simulate a health check
        return true;
    }
}

let awsInstance: AWSService | null = null;

export function getAWS(): AWSService {
    if (!awsInstance) {
        awsInstance = new AWSService();
    }
    return awsInstance;
}
