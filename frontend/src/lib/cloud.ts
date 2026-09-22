export interface CloudMetrics {
    latencyMs: number;
    cost: number;
    model: string;
    provider: string;
    response: string;
}

export interface CloudProvider {
    name: string;
    invoke(prompt: string): Promise<CloudMetrics | null>;
}

class GroqProvider implements CloudProvider {
    name = 'GROQ';
    private apiKey = import.meta.env.VITE_GROQ_API_KEY;

    async invoke(prompt: string): Promise<CloudMetrics | null> {
        if (!this.apiKey) return null;
        const startTime = performance.now();
        try {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'llama-3.1-8b-instant',
                    messages: [{ role: 'user', content: prompt }]
                })
            });
            const data = await response.json();
            const endTime = performance.now();
            return {
                latencyMs: endTime - startTime,
                cost: 0.0001, // Groq is free for now, using nominal cost
                model: 'Llama-3.1-8b',
                provider: this.name,
                response: data.choices[0].message.content
            };
        } catch (e) {
            console.error('Groq failed:', e);
            return null;
        }
    }
}

class GeminiProvider implements CloudProvider {
    name = 'GEMINI';
    private apiKey = import.meta.env.VITE_GEMINI_API_KEY;

    async invoke(prompt: string): Promise<CloudMetrics | null> {
        if (!this.apiKey) return null;
        const startTime = performance.now();
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });
            const data = await response.json();
            const endTime = performance.now();
            return {
                latencyMs: endTime - startTime,
                cost: 0.0002,
                model: 'Gemini-1.5-Flash',
                provider: this.name,
                response: data.candidates[0].content.parts[0].text
            };
        } catch (e) {
            console.error('Gemini failed:', e);
            return null;
        }
    }
}

class HuggingFaceProvider implements CloudProvider {
    name = 'HF';
    private apiKey = import.meta.env.VITE_HF_API_KEY;

    async invoke(prompt: string): Promise<CloudMetrics | null> {
        if (!this.apiKey) return null;
        const startTime = performance.now();
        try {
            const response = await fetch('https://api-inference.huggingface.co/models/mistralai/Mistral-7B-v0.1', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ inputs: prompt })
            });
            const data = await response.json();
            const endTime = performance.now();
            return {
                latencyMs: endTime - startTime,
                cost: 0.00005,
                model: 'Mistral-7B',
                provider: this.name,
                response: Array.isArray(data) ? data[0].generated_text : data.generated_text
            };
        } catch (e) {
            console.error('HF failed:', e);
            return null;
        }
    }
}

export class MultiCloudService {
    private providers: CloudProvider[] = [
        new GroqProvider(),
        new GeminiProvider(),
        new HuggingFaceProvider()
    ];

    async invokeModel(prompt: string): Promise<CloudMetrics | null> {
        // Try providers in order (Groq -> Gemini -> HF)
        for (const provider of this.providers) {
            const result = await provider.invoke(prompt);
            if (result) return result;
        }
        return null;
    }

    getProviders() {
        return this.providers.map(p => p.name);
    }
}

let cloudInstance: MultiCloudService | null = null;

export function getCloud(): MultiCloudService {
    if (!cloudInstance) {
        cloudInstance = new MultiCloudService();
    }
    return cloudInstance;
}
