// Real market data API integration for live volatility detection
// Uses free APIs: Finnhub (free tier) and Alpha Vantage (free tier)

export interface MarketQuote {
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
    timestamp: number;
    source: string;
}

export interface VolatilityMetrics {
    currentVolatility: number;  // 0-1 scale
    isSpike: boolean;
    spikeReason: string | null;
    priceChanges: number[];
}

// Finnhub free API (no key required for basic quotes via websocket)
// Documentation: https://finnhub.io/docs/api

// Alpha Vantage free API (needs free key, 5 calls/min)
const ALPHA_VANTAGE_BASE = 'https://www.alphavantage.co/query';

// Demo API key (free tier - replace with your own for production)
// Get free key at: https://www.alphavantage.co/support/#api-key
const DEMO_API_KEY = 'demo'; // Limited but works for IBM, etc.

export class MarketDataService {
    private priceHistory: Map<string, number[]> = new Map();
    private latestQuotes: Map<string, MarketQuote> = new Map();
    private listeners: Set<(volatility: VolatilityMetrics) => void> = new Set();
    private pollInterval: number | null = null;

    // Symbols to track for volatility
    private symbols = ['IBM', 'AAPL', 'GOOGL', 'MSFT'];

    // Fetch real quote from Alpha Vantage
    async fetchQuote(symbol: string): Promise<MarketQuote | null> {
        try {
            const url = `${ALPHA_VANTAGE_BASE}?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${DEMO_API_KEY}`;

            const startTime = performance.now();
            const response = await fetch(url);
            const latencyMs = performance.now() - startTime;

            const data = await response.json();

            if (data['Global Quote']) {
                const quote = data['Global Quote'];
                const marketQuote: MarketQuote = {
                    symbol,
                    price: parseFloat(quote['05. price']) || 0,
                    change: parseFloat(quote['09. change']) || 0,
                    changePercent: parseFloat(quote['10. change percent']?.replace('%', '')) || 0,
                    timestamp: Date.now(),
                    source: `Alpha Vantage (${latencyMs.toFixed(0)}ms)`,
                };

                this.updatePriceHistory(symbol, marketQuote.price);
                this.latestQuotes.set(symbol, marketQuote);

                return marketQuote;
            }

            return null;
        } catch (error) {
            console.error('Failed to fetch quote:', error);
            return null;
        }
    }

    // Alternative: Use free Twelve Data API
    async fetchFromTwelveData(symbol: string): Promise<MarketQuote | null> {
        try {
            // Free tier: 8 calls/min, no API key needed for basic
            const url = `https://api.twelvedata.com/price?symbol=${symbol}&apikey=demo`;

            const startTime = performance.now();
            const response = await fetch(url);
            const latencyMs = performance.now() - startTime;

            const data = await response.json();

            if (data.price) {
                const marketQuote: MarketQuote = {
                    symbol,
                    price: parseFloat(data.price),
                    change: 0,
                    changePercent: 0,
                    timestamp: Date.now(),
                    source: `Twelve Data (${latencyMs.toFixed(0)}ms)`,
                };

                this.updatePriceHistory(symbol, marketQuote.price);
                this.latestQuotes.set(symbol, marketQuote);

                return marketQuote;
            }

            return null;
        } catch (error) {
            console.error('Failed to fetch from Twelve Data:', error);
            return null;
        }
    }

    private updatePriceHistory(symbol: string, price: number): void {
        const history = this.priceHistory.get(symbol) || [];
        history.push(price);

        // Keep last 20 prices
        if (history.length > 20) {
            history.shift();
        }

        this.priceHistory.set(symbol, history);
    }

    // Calculate real volatility from price changes
    calculateVolatility(): VolatilityMetrics {
        const allChanges: number[] = [];

        this.priceHistory.forEach((prices) => {
            if (prices.length >= 2) {
                for (let i = 1; i < prices.length; i++) {
                    const change = Math.abs((prices[i] - prices[i - 1]) / prices[i - 1]);
                    allChanges.push(change);
                }
            }
        });

        if (allChanges.length === 0) {
            return {
                currentVolatility: 0,
                isSpike: false,
                spikeReason: null,
                priceChanges: [],
            };
        }

        // Calculate standard deviation of changes
        const mean = allChanges.reduce((a, b) => a + b, 0) / allChanges.length;
        const variance = allChanges.reduce((sum, val) => sum + (val - mean) ** 2, 0) / allChanges.length;
        const stdDev = Math.sqrt(variance);

        // Normalize to 0-1 scale (assuming typical volatility around 0.01-0.05)
        const normalizedVolatility = Math.min(1, stdDev * 20);

        // Detect spike: volatility > 0.6 or any single change > 2%
        const maxChange = Math.max(...allChanges);
        const isSpike = normalizedVolatility > 0.6 || maxChange > 0.02;

        let spikeReason: string | null = null;
        if (isSpike) {
            if (maxChange > 0.02) {
                spikeReason = `Large price movement: ${(maxChange * 100).toFixed(2)}%`;
            } else {
                spikeReason = `High volatility: ${(normalizedVolatility * 100).toFixed(1)}%`;
            }
        }

        return {
            currentVolatility: normalizedVolatility,
            isSpike,
            spikeReason,
            priceChanges: allChanges,
        };
    }

    // Start polling for real market data
    startPolling(intervalMs: number = 60000): void {
        if (this.pollInterval) return;

        // Initial fetch
        this.fetchAllQuotes();

        // Poll every intervalMs (respect rate limits)
        this.pollInterval = window.setInterval(() => {
            this.fetchAllQuotes();
        }, intervalMs);
    }

    private async fetchAllQuotes(): Promise<void> {
        // Rotate through symbols to avoid rate limits
        for (const symbol of this.symbols) {
            const quote = await this.fetchQuote(symbol);
            if (quote) {
                const volatility = this.calculateVolatility();
                this.notifyListeners(volatility);
            }

            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    stopPolling(): void {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    subscribe(listener: (volatility: VolatilityMetrics) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(volatility: VolatilityMetrics): void {
        this.listeners.forEach(listener => listener(volatility));
    }

    getLatestQuotes(): MarketQuote[] {
        return Array.from(this.latestQuotes.values());
    }
}

// Singleton instance
let marketDataInstance: MarketDataService | null = null;

export function getMarketData(): MarketDataService {
    if (!marketDataInstance) {
        marketDataInstance = new MarketDataService();
    }
    return marketDataInstance;
}

// Simple latency tester for any API
export async function measureApiLatency(url: string): Promise<{ latencyMs: number; success: boolean }> {
    try {
        const startTime = performance.now();
        const response = await fetch(url, { method: 'HEAD' });
        const latencyMs = performance.now() - startTime;
        return { latencyMs, success: response.ok };
    } catch {
        return { latencyMs: -1, success: false };
    }
}
