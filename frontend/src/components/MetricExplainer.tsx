import React, { useState } from 'react';
import { Info, X } from 'lucide-react';

interface MetricInfo {
    title: string;
    definition: string;
    significance: string;
    unit: string;
}

const METRIC_DEFINITIONS: Record<string, MetricInfo> = {
    'p99 Latency': {
        title: 'p99 Latency (Tail Latency)',
        definition: 'The time within which 99% of all requests are completed.',
        significance: 'In finance, p99 is more critical than average latency because it represents the worst-case scenario for risk checks.',
        unit: 'Milliseconds (ms)'
    },
    'SLO Violations': {
        title: 'SLO (Service Level Objective)',
        definition: 'A target level for the reliability of a service.',
        significance: 'Violating an SLO in high-frequency trading can lead to significant financial loss or regulatory penalties.',
        unit: 'Count'
    },
    'Risk Exposure': {
        title: 'Risk Exposure',
        definition: 'The potential financial loss due to system latency or model inaccuracy.',
        significance: 'Calculated as: (Probability of SLO Violation × Penalty) + (Model Accuracy Gap × Asset Value).',
        unit: 'USD ($)'
    },
    'GFLOPS': {
        title: 'GFLOPS (Giga-Floating Point Operations Per Second)',
        definition: 'A measure of computer performance, representing one billion floating-point operations per second.',
        significance: 'Higher GFLOPS indicate more powerful hardware capable of running complex Monte Carlo simulations in real-time.',
        unit: 'Billion Ops/Sec'
    },
    'TTFT': {
        title: 'TTFT (Time to First Token)',
        definition: 'The time it takes for an AI model to start generating the first piece of information.',
        significance: 'Critical for interactive risk assessment where the first "signal" is needed immediately.',
        unit: 'Milliseconds (ms)'
    },
    'TPS': {
        title: 'TPS (Tokens Per Second)',
        definition: 'The throughput of an AI model, measuring how many pieces of information it generates per second.',
        significance: 'Higher TPS allows for more detailed risk narratives and faster pricing updates.',
        unit: 'Tokens/Sec'
    }
};

export function MetricExplainer({ metricName }: { metricName: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const info = METRIC_DEFINITIONS[metricName];

    if (!info) return null;

    return (
        <div className="relative inline-block ml-1">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="text-gray-500 hover:text-cyan-400 transition-colors"
                title="What is this?"
            >
                <Info className="w-3 h-3" />
            </button>

            {isOpen && (
                <div className="absolute z-50 bottom-full left-0 mb-2 w-64 p-4 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl animate-fade-in">
                    <div className="flex justify-between items-start mb-2">
                        <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">{info.title}</h4>
                        <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-white">
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                    <p className="text-xs text-gray-300 mb-2 leading-relaxed">
                        {info.definition}
                    </p>
                    <div className="pt-2 border-t border-gray-800">
                        <p className="text-[10px] text-gray-500 italic">
                            <span className="text-gray-400 font-semibold">Significance:</span> {info.significance}
                        </p>
                    </div>
                    <div className="mt-2 text-[10px] text-cyan-500/50 font-mono">
                        Unit: {info.unit}
                    </div>
                </div>
            )}
        </div>
    );
}
