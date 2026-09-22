// Ollama API integration for real AI inference latency measurement
// Documentation: https://github.com/ollama/ollama/blob/main/docs/api.md

export interface OllamaResponse {
    model: string;
    created_at: string;
    response: string;
    done: boolean;
    total_duration: number;
    load_duration: number;
    prompt_eval_count: number;
    prompt_eval_duration: number;
    eval_count: number;
    eval_duration: number;
}

export interface OllamaMetrics {
    ttftMs: number; // Time to First Token
    tps: number;    // Tokens Per Second
    totalLatencyMs: number;
    model: string;
}

const OLLAMA_BASE_URL = 'http://localhost:11434/api';

export class OllamaService {
    private model: string = 'llama3'; // Default model

    constructor(model?: string) {
        if (model) this.model = model;
    }

    async checkConnection(): Promise<boolean> {
        try {
            const response = await fetch(`${OLLAMA_BASE_URL}/tags`);
            return response.ok;
        } catch {
            return false;
        }
    }

    async generate(prompt: string): Promise<OllamaMetrics | null> {
        const startTime = performance.now();
        let firstTokenTime: number | null = null;

        try {
            const response = await fetch(`${OLLAMA_BASE_URL}/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.model,
                    prompt: prompt,
                    stream: true,
                }),
            });

            if (!response.ok) return null;

            const reader = response.body?.getReader();
            if (!reader) return null;

            let totalTokens = 0;
            let lastResult: OllamaResponse | null = null;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                if (firstTokenTime === null) {
                    firstTokenTime = performance.now();
                }

                const chunk = new TextDecoder().decode(value);
                const lines = chunk.split('\n').filter(l => l.trim());

                for (const line of lines) {
                    try {
                        const json = JSON.parse(line) as OllamaResponse;
                        lastResult = json;
                        if (json.done) break;
                        totalTokens++;
                    } catch (e) {
                        console.error('Error parsing Ollama chunk:', e);
                    }
                }
            }

            const endTime = performance.now();
            const totalLatencyMs = endTime - startTime;
            const ttftMs = firstTokenTime ? firstTokenTime - startTime : totalLatencyMs;

            // eval_count is the number of tokens generated
            const tokens = lastResult?.eval_count || totalTokens;
            const tps = tokens / (totalLatencyMs / 1000);

            return {
                ttftMs,
                tps,
                totalLatencyMs,
                model: this.model,
            };
        } catch (error) {
            console.error('Ollama generation failed:', error);
            return null;
        }
    }

    setModel(model: string) {
        this.model = model;
    }

    getModel(): string {
        return this.model;
    }
}

let ollamaInstance: OllamaService | null = null;

export function getOllama(): OllamaService {
    if (!ollamaInstance) {
        ollamaInstance = new OllamaService();
    }
    return ollamaInstance;
}
