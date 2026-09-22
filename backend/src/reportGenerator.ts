import { getLatencySamples, getInferenceLog } from './storage';

interface JobData {
  id: string;
  type: string;
  volatility: number;
  depth: string;
  status: string;
  submittedAt: number;
  completedAt?: number;
  results?: {
    p99Latency: number;
    riskScore: number;
    sloViolations: number;
    estimatedSlippage: number;
    hpcMetrics?: {
      scenariosSimulated: number;
      dataPointsProcessed: number;
      parallelWorkers: number;
      peakThroughput: number;
      executionTimeSeconds: number;
      sequentialTimeMinutes: number;
      speedup: number;
      localPercentage: number;
      cloudPercentage: number;
      localCost: number;
      cloudCost: number;
    };
  };
}

export async function generateExecutiveReport(job: JobData): Promise<string> {
  if (!job.results) {
    throw new Error('Job must be completed to generate report');
  }

  // Get recent context from CSV data
  const recentLatency = getLatencySamples().slice(-20);
  const recentInferences = getInferenceLog().slice(-10);

  // Calculate baseline metrics for comparison
  const avgP99 = recentLatency.length > 0
    ? recentLatency.reduce((sum, s) => sum + s.latencyMs, 0) / recentLatency.length
    : 0;

  // Use HPC metrics if available, otherwise fallback to session metrics
  const hpc = job.results.hpcMetrics;

  const executionTime = hpc ? hpc.executionTimeSeconds.toFixed(1) :
    (job.completedAt && job.submittedAt ? ((job.completedAt - job.submittedAt) / 1000).toFixed(1) : 'N/A');

  const localPercentage = hpc ? hpc.localPercentage :
    (recentInferences.length > 0 ? (recentInferences.filter(i => i.cost === 0).length / recentInferences.length) * 100 : 100);

  const cloudPercentage = 100 - localPercentage;
  const infraCost = hpc ? hpc.cloudCost : recentInferences.reduce((sum, i) => sum + i.cost, 0);

  // Determine risk level
  const riskScore = Math.round(job.results.riskScore);
  const riskLevel = riskScore > 80 ? 'CRITICAL' :
    riskScore > 60 ? 'HIGH' :
      riskScore > 40 ? 'MODERATE' : 'LOW';

  // Calculate comparison
  const vsBaseline = avgP99 > 0
    ? ((job.results.p99Latency / avgP99 - 1) * 100).toFixed(0)
    : 'N/A';

  const costEfficiency = localPercentage.toFixed(0);

  // Generate professional report
  const report = `
EXECUTIVE RISK ANALYSIS REPORT
Generated: ${new Date().toLocaleString()}
Job ID: ${job.id}
═══════════════════════════════════════════════════════════════════

EXECUTIVE SUMMARY

This ${job.depth} analysis evaluated portfolio risk under ${job.volatility}% market volatility conditions. Our HPC simulation processed ${hpc ? hpc.scenariosSimulated.toLocaleString() : 'multiple'} scenarios and identified a ${riskLevel} risk level with a risk score of ${riskScore}/100.

Key Finding: The system detected ${job.results.sloViolations.toFixed(1)}% SLO violations with p99 tail latency reaching ${job.results.p99Latency.toFixed(1)}ms, indicating ${riskLevel === 'CRITICAL' ? 'immediate action is required' : riskLevel === 'HIGH' ? 'significant attention is needed' : 'acceptable risk levels'}.

───────────────────────────────────────────────────────────────────

KEY FINDINGS

- Performance Metrics
  - p99 Tail Latency: ${job.results.p99Latency.toFixed(1)}ms (${vsBaseline !== 'N/A' ? vsBaseline + '% vs baseline' : 'baseline not available'})
  - SLO Violation Rate: ${job.results.sloViolations.toFixed(1)}%
  - Execution Time: ${executionTime} seconds

- Financial Impact
  - Estimated Slippage: $${job.results.estimatedSlippage.toFixed(2)} per trade
  - Risk Score: ${job.results.riskScore}/100 (${riskLevel} risk level)
  - Market Volatility Tested: ${job.volatility}%

- Infrastructure Performance
  - Hybrid Cloud Routing: ${localPercentage.toFixed(0)}% Local / ${cloudPercentage.toFixed(0)}% Cloud
  - Parallel Computing: ${hpc ? hpc.parallelWorkers + ' cores' : 'Standard'}
  - Infrastructure Cost: $${infraCost.toFixed(4)}
  - Cost Efficiency: ${costEfficiency}% local routing

───────────────────────────────────────────────────────────────────

RISK ASSESSMENT: ${riskLevel}

${riskLevel === 'CRITICAL'
      ? `CRITICAL risk detected. Portfolio exhibits severe vulnerability under current market conditions. The combination of high tail latency (${job.results.p99Latency.toFixed(1)}ms) and elevated SLO violations (${job.results.sloViolations.toFixed(1)}%) indicates system strain that could lead to significant financial losses during volatile periods.`
      : riskLevel === 'HIGH'
        ? `HIGH risk identified. Portfolio shows concerning performance degradation under ${job.volatility}% volatility conditions. While not immediately critical, the elevated risk score (${job.results.riskScore}/100) and SLO violation rate suggest potential for substantial losses if market conditions worsen.`
        : riskLevel === 'MODERATE'
          ? `MODERATE risk level detected. Portfolio demonstrates acceptable but elevated risk under current conditions. The system is performing within acceptable parameters, though monitoring is recommended as volatility increases.`
          : `LOW risk environment. Portfolio shows strong resilience under tested conditions. Performance metrics indicate the system can handle current volatility levels with minimal financial impact.`}

The p99 latency of ${job.results.p99Latency.toFixed(1)}ms ${job.results.p99Latency > 1000 ? 'exceeds acceptable thresholds for high-frequency trading' : job.results.p99Latency > 500 ? 'approaches warning levels for time-sensitive operations' : 'remains within acceptable bounds'}.

───────────────────────────────────────────────────────────────────

BUSINESS IMPACT

Estimated Financial Exposure:
- Per-Trade Slippage: $${job.results.estimatedSlippage.toFixed(2)}
- Daily Exposure (1000 trades): $${(job.results.estimatedSlippage * 1000).toFixed(2)}
- Annual Risk Estimate: $${(job.results.estimatedSlippage * 250000).toFixed(2)}

${riskLevel === 'CRITICAL' || riskLevel === 'HIGH'
      ? `WARNING: Current risk levels could result in significant financial losses. At ${job.volatility}% volatility with ${job.results.sloViolations.toFixed(1)}% SLO violations, the portfolio is exposed to substantial downside risk during market stress events.`
      : `Current risk levels are manageable under normal market conditions. However, increased volatility could escalate exposure rapidly.`}

───────────────────────────────────────────────────────────────────

RECOMMENDATIONS

${riskLevel === 'CRITICAL'
      ? `1. IMMEDIATE ACTION REQUIRED: Reduce position sizes by 40-50% until system performance improves
2. Enable aggressive circuit breakers at 10% drawdown threshold  
3. Shift to lower-frequency trading strategies to reduce latency exposure
4. Consider temporary suspension of high-risk trades during peak volatility
5. Implement additional cloud capacity to handle tail latency spikes`
      : riskLevel === 'HIGH'
        ? `1. Reduce position sizes by 25-30% as a precautionary measure
2. Enable circuit breakers at 15% drawdown threshold
3. Increase monitoring frequency during volatile periods
4. Consider hedging strategies with VIX options or protective puts
5. Review and optimize HPC routing to reduce cloud dependency costs`
        : riskLevel === 'MODERATE'
          ? `1. Maintain current position sizing with vigilant monitoring
2. Enable circuit breakers at 20% drawdown threshold
3. Continue current cost-aware routing strategy (${costEfficiency}% local efficiency)
4. Review portfolio correlation to identify concentration risks
5. Prepare hedging strategies for rapid deployment if conditions deteriorate`
          : `1. Current strategy appears well-optimized for tested conditions
2. Maintain standard circuit breakers at 25% drawdown
3. Continue leveraging ${costEfficiency}% local compute efficiency
4. Monitor for emerging risks as market conditions evolve
5. Consider gradually increasing position sizes if risk remains low`}

───────────────────────────────────────────────────────────────────

TECHNICAL DETAILS

HPC Execution Summary:
- Simulation Type: ${job.type}
- Analysis Depth: ${job.depth}
- Scenarios Optimized: ${hpc ? hpc.scenariosSimulated.toLocaleString() : 'N/A'}
- Compute Mix: ${localPercentage.toFixed(0)}% Local / ${cloudPercentage.toFixed(0)}% Cloud
- Total Execution Time: ${executionTime} seconds
- Infrastructure Cost: $${infraCost.toFixed(4)}

Performance Benchmarks:
- Baseline p99: ${avgP99.toFixed(1)}ms
- Current p99: ${job.results.p99Latency.toFixed(1)}ms
- Performance Delta: ${vsBaseline !== 'N/A' ? vsBaseline + '%' : 'N/A'}

The system successfully leveraged cost-aware routing, achieving ${costEfficiency}% local compute efficiency while maintaining ${(100 - job.results.sloViolations).toFixed(1)}% SLO compliance.

═══════════════════════════════════════════════════════════════════

DISCLAIMER: This report is generated based on HPC simulation data and 
should be used in conjunction with other risk management tools. Past 
performance does not guarantee future results. Consult with qualified 
financial advisors before making trading decisions.

Report ID: ${job.id}
Generated: ${new Date().toISOString()}
`;

  return report.trim();
}