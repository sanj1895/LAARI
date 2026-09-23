import React, { useState } from 'react';
import { Brain, Loader, Sparkles, Send } from 'lucide-react';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface ParsedJob {
  jobType: 'stress-test' | 'risk-check' | 'comparison' | 'quick-analysis';
  volatility: number; // 0-100
  depth: 'quick' | 'standard' | 'deep';
  description: string;
}

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const EXAMPLE_QUERIES = [
  "Stress test my tech portfolio during high volatility",
  "Check risk if market drops 10%",
  "Run a quick analysis on stable market",
  "Compare my strategy in calm vs volatile markets"
];

export function NaturalLanguageJobSubmission({ onJobSubmit }: { onJobSubmit: (job: ParsedJob) => void }) {
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastParsed, setLastParsed] = useState<ParsedJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parseJobIntent = async (userInput: string): Promise<ParsedJob> => {
    // Simple keyword-based parsing (no API needed)
    const input = userInput.toLowerCase();

    let jobType: ParsedJob['jobType'] = 'risk-check';
    let volatility = 50;
    let depth: ParsedJob['depth'] = 'standard';
    let description = '';

    // Determine job type
    if (input.includes('stress') || input.includes('crash') || input.includes('extreme')) {
      jobType = 'stress-test';
      volatility = 85;
      description = 'Stress testing portfolio under extreme market conditions';
    } else if (input.includes('compare') || input.includes('vs') || input.includes('versus')) {
      jobType = 'comparison';
      volatility = 60;
      description = 'Comparing portfolio performance across different market conditions';
    } else if (input.includes('quick') || input.includes('fast')) {
      jobType = 'quick-analysis';
      volatility = 30;
      depth = 'quick';
      description = 'Quick risk assessment under normal conditions';
    } else {
      jobType = 'risk-check';
      volatility = 50;
      description = 'Standard risk analysis of portfolio';
    }

    // Adjust volatility based on keywords
    if (input.includes('high') || input.includes('volatile')) {
      volatility = Math.min(95, volatility + 20);
    }
    if (input.includes('low') || input.includes('calm') || input.includes('stable')) {
      volatility = Math.max(10, volatility - 30);
    }
    if (input.includes('drop') || input.includes('fall')) {
      volatility = Math.min(90, volatility + 15);
    }

    // Adjust depth
    if (input.includes('deep') || input.includes('thorough') || input.includes('comprehensive')) {
      depth = 'deep';
    } else if (input.includes('quick') || input.includes('fast') || input.includes('brief')) {
      depth = 'quick';
    }

    // Simulate a small delay so it feels like processing
    await new Promise(resolve => setTimeout(resolve, 800));

    return {
      jobType,
      volatility,
      depth,
      description
    };
  };

  const handleSubmit = async () => {
    if (!input.trim()) return;

    setIsProcessing(true);
    setError(null);

    try {
      const parsed = await parseJobIntent(input);
      setLastParsed(parsed);

      // Call parent callback to actually submit the job
      onJobSubmit(parsed);

      // Clear input
      setInput('');
    } catch (err: any) {
      setError(err.message || 'Failed to process request');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExampleClick = (example: string) => {
    setInput(example);
  };

  return (
    <div className="card bg-gradient-to-br from-purple-900/10 to-transparent border-purple-500/20">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-purple-400 flex items-center gap-2">
          <Brain className="w-4 h-4" />
          AI-Powered Job Submission
        </h3>
        <div className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded uppercase font-bold flex items-center gap-1">
          <Sparkles className="w-3 h-3" /> Gemini AI
        </div>
      </div>

      {/* Natural Language Input */}
      <div className="mb-3">
        <label className="block text-xs text-gray-400 mb-2">
          Describe what you want to analyze
        </label>
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.metaKey) {
                handleSubmit();
              }
            }}
            placeholder="e.g., 'Stress test my portfolio during high volatility' or 'Check risk if market drops 10%'"
            className="w-full bg-gray-800 text-white p-3 rounded-lg border border-gray-700 focus:border-purple-500 focus:outline-none resize-none text-sm"
            rows={3}
            disabled={isProcessing}
          />
          {isProcessing && (
            <div className="absolute top-2 right-2">
              <Loader className="w-4 h-4 text-purple-400 animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Example Queries */}
      <div className="mb-3">
        <div className="text-[10px] text-gray-500 mb-1.5 uppercase tracking-wider">Try these examples:</div>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLE_QUERIES.map((example, idx) => (
            <button
              key={idx}
              onClick={() => handleExampleClick(example)}
              className="text-[10px] px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded border border-gray-700 hover:border-purple-500/50 transition-all"
              disabled={isProcessing}
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={!input.trim() || isProcessing}
        className="w-full bg-purple-500 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all"
      >
        {isProcessing ? (
          <>
            <Loader className="w-4 h-4 animate-spin" />
            AI Processing...
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            Submit via AI
          </>
        )}
      </button>

      {/* Error Display */}
      {error && (
        <div className="mt-3 p-2 bg-red-900/20 border border-red-500/50 rounded text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Last Parsed Job Preview */}
      {lastParsed && (
        <div className="mt-3 p-3 bg-green-900/10 border border-green-500/30 rounded">
          <div className="text-[10px] text-green-400 font-bold mb-1 uppercase">✓ Job Submitted</div>
          <div className="text-xs text-gray-300">{lastParsed.description}</div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
            <div>
              <span className="text-gray-500">Type:</span>
              <div className="text-white font-mono">{lastParsed.jobType}</div>
            </div>
            <div>
              <span className="text-gray-500">Volatility:</span>
              <div className="text-white font-mono">{lastParsed.volatility}%</div>
            </div>
            <div>
              <span className="text-gray-500">Depth:</span>
              <div className="text-white font-mono">{lastParsed.depth}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}