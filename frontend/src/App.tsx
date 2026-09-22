import { ExecutiveReportModal } from './components/ExecutiveReportModal';
import { PastSessionModal } from './components/PastSessionModal';
import { PastMonitoringSessions } from './components/PastMonitoringSessions';
import { FileText, Loader } from 'lucide-react';
import { NaturalLanguageJobSubmission } from './components/NaturalLanguageJobSubmission';
import { useState, useEffect } from 'react';
import { useAuth0 } from "@auth0/auth0-react";
import {
  Activity,
  AlertTriangle,
  Cpu,
  Gauge,
  Play,
  TrendingUp,
  Zap,
  Brain,
  ShieldCheck,
  ZapOff,
  Cloud,
  DollarSign,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  AreaChart,
  Area,
  Tooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';
import { getRealTimeController, type RealTimeState } from './lib/realTimeController';
import { MetricExplainer } from './components/MetricExplainer';
import './App.css';

// Metric Card Component
function MetricCard({
  title,
  value,
  unit,
  icon: Icon,
  trend,
  status,
  explainer
}: {
  title: string;
  value: string | number;
  unit?: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  trend?: 'up' | 'down' | 'stable';
  status?: 'healthy' | 'warning' | 'critical';
  explainer?: string;
}) {
  const statusColor = {
    healthy: 'var(--accent-green)',
    warning: 'var(--accent-amber)',
    critical: 'var(--accent-red)',
  }[status || 'healthy'];

  return (
    <div className="card animate-slide-up group hover:border-cyan-500/50 transition-all duration-300">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <span className="metric-label">{title}</span>
          {explainer && <MetricExplainer metricName={explainer} />}
        </div>
        <Icon className="w-4 h-4 group-hover:scale-110 transition-transform" style={{ color: statusColor }} />
      </div>
      <div className="flex items-baseline gap-1">
        <span className="metric-value text-2xl font-bold">{value}</span>
        {unit && <span className="text-sm text-gray-400">{unit}</span>}
      </div>
      {trend && (
        <div className={`text-[10px] mt-1 ${trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-gray-400'}`}>
          {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} real-time delta
        </div>
      )}
    </div>
  );
}

// Hardware Status Component
function HardwareStatus({ state, activeJobs }: { state: RealTimeState; activeJobs: any[] }) {
  const runningJobs = activeJobs.filter(j => j.status === 'running').length;

  // RPS of 2.0 = ~40% load, plus 15% per running background job
  const throughputLoad = Math.min(0.8, (state.metrics.requestsPerSecond * 20) / 100);
  const backgroundLoad = Math.min(0.7, runningJobs * 0.15);

  const totalLoad = Math.min(1, throughputLoad + backgroundLoad + (state.isRunning ? 0.05 : 0));

  const gpuUtil = totalLoad * 0.8;
  const cpuUtil = totalLoad * 0.4; // CPU handles less/fallback

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-300">Live Hardware Status</h3>
        <div className="flex gap-2">
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${state.volatility?.isSpike ? 'bg-red-900/40 text-red-400 border border-red-500/50' : 'bg-green-900/40 text-green-400 border border-green-500/50'}`}>
            {state.volatility?.isSpike ? 'HIGH LOAD' : 'OPTIMAL'}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {/* GPU */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Zap className="w-3 h-3" /> GPU Compute (WebGPU)
            </span>
            <span className="text-xs font-mono text-white">{(gpuUtil * 100).toFixed(0)}%</span>
          </div>
          <div className="progress-bar h-1.5">
            <div
              className={`progress-fill ${gpuUtil > 0.8 ? 'red' : 'green'}`}
              style={{ width: `${Math.min(100, gpuUtil * 100)}%` }}
            />
          </div>
        </div>

        {/* CPU */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Cpu className="w-3 h-3" /> CPU Fallback
            </span>
            <span className="text-xs font-mono text-white">{(cpuUtil * 100).toFixed(0)}%</span>
          </div>
          <div className="progress-bar h-1.5">
            <div
              className={`progress-fill ${cpuUtil > 0.8 ? 'red' : 'blue'}`}
              style={{ width: `${Math.min(100, cpuUtil * 100)}%` }}
            />
          </div>
        </div>

        {/* Cloud Status */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Cloud className={`w-3 h-3 ${state.cloudMetrics ? 'text-cyan-400' : 'text-gray-500'}`} />
              Cloud Status ({state.cloudMetrics?.provider || 'Idle'})
            </span>
            <span className={`text-[10px] font-bold ${state.cloudMetrics ? 'text-cyan-400' : 'text-gray-600'}`}>
              {state.cloudMetrics ? 'CONNECTED' : 'STANDBY'}
            </span>
          </div>
          <div className="progress-bar h-1.5">
            <div
              className={`progress-fill ${state.cloudMetrics ? 'green' : 'blue'}`}
              style={{ width: state.cloudMetrics ? '100%' : '0%' }}
            />
          </div>
        </div>

        {/* Ollama Status */}
        <div className="pt-2 border-t border-gray-800">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-gray-500 flex items-center gap-1">
              <Brain className="w-3 h-3" /> Ollama Model:
            </span>
            <span className="text-cyan-400 font-mono">{state.ollamaMetrics?.model || 'llama3'}</span>
          </div>
          {state.ollamaMetrics && (
            <div className="mt-1 grid grid-cols-2 gap-2">
              <div className="bg-gray-800/50 p-1.5 rounded">
                <div className="text-[8px] text-gray-500 uppercase">TTFT</div>
                <div className="text-xs text-white font-mono">{state.ollamaMetrics.ttftMs.toFixed(0)}ms</div>
              </div>
              <div className="bg-gray-800/50 p-1.5 rounded">
                <div className="text-[8px] text-gray-500 uppercase">TPS</div>
                <div className="text-xs text-white font-mono">{state.ollamaMetrics.tps.toFixed(1)}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Cost Optimizer Component
function CostOptimizer({ state }: { state: RealTimeState }) {
  return (
    <div className="card bg-gradient-to-br from-cyan-900/10 to-transparent border-cyan-500/20">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-cyan-400 flex items-center gap-2">
          <DollarSign className="w-4 h-4" /> Cost Routing Engine
        </h3>
        <div className="text-[10px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded uppercase font-bold">Active</div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="text-[10px] text-gray-500 uppercase">Local Savings (Free)</div>
          <div className="text-xl font-mono font-bold text-green-400">${state.localSavings.toFixed(4)}</div>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] text-gray-500 uppercase">Cloud Cost (Paid)</div>
          <div className="text-xl font-mono font-bold text-red-400">${state.cloudCost.toFixed(4)}</div>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-gray-800">
        <div className="flex items-center justify-between text-[10px] mb-2">
          <span className="text-gray-500">Routing Efficiency</span>
          <span className="text-white">{(state.localSavings / (state.localSavings + state.cloudCost + 0.0001) * 100).toFixed(1)}%</span>
        </div>
        <div className="progress-bar h-1">
          <div
            className="progress-fill green"
            style={{ width: `${(state.localSavings / (state.localSavings + state.cloudCost + 0.0001) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// Action Center
function ActionCenter({
  state,
  onOllama,
  onWebGPU,
  onToggleAuto,
  onDemoSteady,
  onDemoSpike
}: {
  state: RealTimeState,
  onOllama: () => void,
  onWebGPU: () => void,
  onToggleAuto: () => void,
  onDemoSteady: () => void,
  onDemoSpike: () => void
}) {
  const [showDevTools, setShowDevTools] = useState(false);

  return (
    <div className="card border-cyan-500/10">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300">Compute Strategy Playground</h3>
        <span className="text-[9px] bg-cyan-500/10 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/20 font-bold uppercase">Simulation Tool</span>
      </div>

      <p className="text-[10px] text-gray-500 mb-4 leading-relaxed">
        Test how the system routes high-stakes risk analysis across hardware tiers based on latency and cost thresholds.
      </p>

      <div className="space-y-3">
        <div className="relative">
          <button
            onClick={onOllama}
            className="w-full flex items-center justify-between px-4 py-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition-all font-bold shadow-[0_0_15px_rgba(8,145,178,0.4)]"
          >
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4" />
              <span>AI Risk Analysis</span>
            </div>
            <span className="text-[8px] bg-black/40 px-1.5 py-0.5 rounded border border-white/10 text-cyan-400">PRIVACY + $0 COST</span>
          </button>
        </div>

        <div className="relative">
          <button
            onClick={onWebGPU}
            className="w-full btn btn-outline flex items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              <span>Monte Carlo Pathing</span>
            </div>
            <span className="text-[8px] bg-cyan-500/10 px-1.5 py-0.5 rounded text-cyan-500">EDGE-GPU SPEED</span>
          </button>
        </div>

        <div className="pt-4 border-t border-gray-800">
          <div
            className="flex items-center justify-between cursor-pointer mb-3 opacity-80 hover:opacity-100"
            onClick={() => setShowDevTools(!showDevTools)}
          >
            <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Scenario Controls</h4>
            {showDevTools ? <ChevronUp className="w-3 h-3 text-gray-500" /> : <ChevronDown className="w-3 h-3 text-gray-500" />}
          </div>

          {showDevTools && (
            <div className="space-y-3 animate-fade-in">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onDemoSteady}
                  className="btn btn-outline text-[10px] py-2 flex flex-col items-center gap-1 border-green-500/30 hover:border-green-500/50"
                >
                  <ShieldCheck className="w-3 h-3 text-green-400" />
                  Steady-State
                </button>
                <button
                  onClick={onDemoSpike}
                  className="btn btn-outline text-[10px] py-2 flex flex-col items-center gap-1 border-red-500/30 hover:border-red-500/50"
                >
                  <AlertTriangle className="w-3 h-3 text-red-400" />
                  Volatility Spike
                </button>
              </div>

              <div className="pt-2 border-t border-gray-800">
                <button
                  onClick={onToggleAuto}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all ${state.isAutoPilot
                    ? 'bg-cyan-900/20 border-cyan-500/50 text-cyan-400'
                    : 'bg-gray-800/50 border-gray-700 text-gray-500'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck className={`w-4 h-4 ${state.isAutoPilot ? 'animate-pulse' : ''}`} />
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider block text-left">Auto-Pilot Mode</span>
                      <span className="text-[8px] opacity-70 block text-left">Cost-Aware Intelligent Routing</span>
                    </div>
                  </div>
                  <div className={`w-8 h-4 rounded-full relative transition-colors ${state.isAutoPilot ? 'bg-cyan-500' : 'bg-gray-600'}`}>
                    <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${state.isAutoPilot ? 'right-0.5' : 'left-0.5'}`} />
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// HPC Scale Visualization Component
function HPCScaleSummary({ metrics }: { metrics: any }) {
  if (!metrics) return null;

  return (
    <div className="mt-3 p-3 bg-cyan-900/20 border border-cyan-500/30 rounded-lg">
      <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-2">
        HPC Execution Summary
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px] mb-3">
        <div>
          <div className="text-gray-500">Scenarios Simulated</div>
          <div className="text-white font-mono font-bold">{metrics.scenariosSimulated.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-gray-500">Data Points</div>
          <div className="text-white font-mono font-bold">{metrics.dataPointsProcessed.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-gray-500">Parallel Workers</div>
          <div className="text-cyan-400 font-mono font-bold">{metrics.parallelWorkers} cores</div>
        </div>
        <div>
          <div className="text-gray-500">Peak Throughput</div>
          <div className="text-cyan-400 font-mono font-bold">{metrics.peakThroughput.toLocaleString()} ops/s</div>
        </div>
      </div>

      <div className="mb-2">
        <div className="text-[10px] text-gray-500 mb-1">Compute Distribution</div>
        <div className="flex h-6 rounded overflow-hidden">
          <div
            className="bg-green-500 flex items-center justify-center text-[9px] font-bold text-black"
            style={{ width: `${metrics.localPercentage}%` }}
          >
            {metrics.localPercentage}% Local
          </div>
          <div
            className="bg-blue-500 flex items-center justify-center text-[9px] font-bold text-white"
            style={{ width: `${metrics.cloudPercentage}%` }}
          >
            {metrics.cloudPercentage}% Cloud
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-700/50">
        <div>
          <div className="text-[9px] text-gray-500">Without HPC</div>
          <div className="text-xs text-gray-400">~{metrics.sequentialTimeMinutes} min</div>
        </div>
        <div>
          <div className="text-[9px] text-gray-500">With HPC</div>
          <div className="text-xs text-green-400 font-bold">{metrics.executionTimeSeconds.toFixed(1)} sec</div>
        </div>
      </div>

      <div className="mt-2 text-center">
        <span className="text-[10px] text-purple-400 font-bold"> {metrics.speedup}x FASTER</span>
      </div>
    </div>
  );
}

function JobQueue({
  jobs,
  onGenerateReport
}: {
  jobs: any[];
  onGenerateReport: (jobId: string) => void;
}) {

  return (
    <div className="card border-purple-500/30">
      <h3 className="text-sm font-semibold text-purple-400 mb-3 flex items-center gap-2">
        <Brain className="w-4 h-4" />
        Active Simulation Jobs
      </h3>
      <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
        {jobs.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-xs italic">
            No active jobs.
          </div>
        )}

        {jobs.slice(0, 5).map((job) => (
          <div
            key={job.id}
            className={`bg-gray-800/50 p-3 rounded border transition-all ${job.status === 'running'
              ? 'border-blue-500/50 animate-pulse'
              : 'border-gray-700'
              }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-gray-400">#{job.id.split('-')[0].toUpperCase()}</span>
                <StatusBadge status={job.status} />
              </div>
              <div className="flex items-center gap-1">
                <span className={`text-xs font-mono ${job.volatility > 70 ? 'text-red-400' : job.volatility > 40 ? 'text-yellow-400' : 'text-green-400'}`}>
                  {job.volatility}%
                </span>
                <span className="text-[10px] text-gray-500">volatility</span>
              </div>
            </div>

            <div className="mb-2">
              <span className="text-[10px] px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">{job.type}</span>
              <span className="text-[10px] text-gray-500 ml-2">{job.depth} depth</span>
            </div>

            {job.status === 'running' && (
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-gray-400">⚙️ Computing HPC job...</span>
                  <span className="text-purple-400 font-mono font-bold">{job.progress}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-purple-500 to-cyan-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
              </div>
            )}

            {job.status === 'completed' && job.results && (
              <>
                <div className="grid grid-cols-2 gap-3 text-[10px] mt-2 pt-2 border-t border-gray-700/50">
                  <div className="bg-cyan-900/20 p-2 rounded">
                    <span className="text-gray-400 block mb-1">p99 Latency</span>
                    <div className={`text-sm font-mono font-bold ${job.results.p99Latency > 800 ? 'text-red-400' : 'text-cyan-400'}`}>
                      {job.results.p99Latency.toFixed(1)}ms
                    </div>
                  </div>
                  <div className="bg-red-900/20 p-2 rounded">
                    <span className="text-gray-400 block mb-1">Risk Score</span>
                    <div className={`text-sm font-mono font-bold ${job.results.riskScore > 80 ? 'text-red-400' : job.results.riskScore > 50 ? 'text-yellow-400' : 'text-green-400'}`}>
                      {job.results.riskScore.toFixed(0)}
                    </div>
                  </div>
                  <div className="bg-amber-900/20 p-2 rounded col-span-2">
                    <span className="text-gray-400 block mb-1">SLO Violations</span>
                    <div className="text-sm font-mono font-bold text-amber-400">{job.results.sloViolations.toFixed(1)}%</div>
                  </div>
                </div>

                {job.results.hpcMetrics && <HPCScaleSummary metrics={job.results.hpcMetrics} />}

                <button
                  onClick={() => onGenerateReport(job.id)}
                  className="w-full mt-3 flex items-center justify-center gap-2 px-3 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-lg transition-all text-xs font-bold"
                >
                  <FileText className="w-4 h-4" />
                  Generate Executive Report
                </button>
              </>
            )}

            <div className="text-[9px] text-gray-600 mt-2">
              Submitted {new Date(job.submittedAt).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>


    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors = {
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    running: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    completed: 'bg-green-500/20 text-green-400 border-green-500/50',
  };

  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${colors[status as keyof typeof colors]}`}>
      {status.toUpperCase()}
    </span>
  );
}

// Main App
function App() {
  const {
    isAuthenticated,
    loginWithRedirect,
    logout,
    user,
    getAccessTokenSilently,
  } = useAuth0();

  const controller = getRealTimeController();
  const [state, setState] = useState<RealTimeState>(controller.getState());
  const [latencyHistory, setLatencyHistory] = useState<Array<{ time: number; p50: number; p95: number; p99: number }>>([]);
  const [activeJobs, setActiveJobs] = useState<any[]>([]);

  // Modals state
  const [reportModal, setReportModal] = useState<{ show: boolean; report: string; jobId: string; loading: boolean }>({
    show: false,
    report: '',
    jobId: '',
    loading: false
  });

  const [pastSessionModal, setPastSessionModal] = useState<{ show: boolean; htmlContent: string; loading: boolean }>({
    show: false,
    htmlContent: '',
    loading: false
  });

  useEffect(() => {
    const unsubscribe = controller.subscribe((newState) => {
      setState(newState);

      // Update latency history
      if (newState.isRunning) {
        setLatencyHistory(prev => {
          const newPoint = {
            time: Date.now(),
            p50: newState.metrics.p50LatencyMs,
            p95: newState.metrics.p95LatencyMs || newState.metrics.p50LatencyMs * 1.5,
            p99: newState.metrics.p99LatencyMs,
          };
          return [...prev, newPoint].slice(-20);
        });
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const pollJobs = setInterval(async () => {
      try {
        const response = await fetch('http://localhost:5050/api/jobs');
        const jobs = await response.json();
        setActiveJobs(jobs);
      } catch (err) {
        console.error('Failed to fetch jobs:', err);
      }
    }, 1000);

    return () => clearInterval(pollJobs);
  }, []);

  const handleStart = () => controller.start();
  const handleStop = () => controller.stop();
  const handleOllama = () => controller.runOllamaInference();
  const handleWebGPU = () => controller.runWebGPUMonteCarlo();
  const handleToggleAuto = () => controller.toggleAutoPilot();
  const handleDemoSteady = () => controller.runDemoSteadyState();
  const handleDemoSpike = () => controller.runDemoVolatilitySpike();

  const [reports, setReports] = useState<any[]>([]);
  /*
  // Old effect - fetches on load regardless of auth
  useEffect(() => {
    fetch("http://localhost:5050/api/reports")
      .then(res => res.json())
      .then(setReports)
      .catch(console.error);
  }, []);
  */

  // NEW: Fetch reports regardless of auth status
  useEffect(() => {
    fetch("http://localhost:5050/api/reports")
      .then(res => res.json())
      .then(setReports)
      .catch(console.error);
  }, [isAuthenticated]);

  const handleJobSubmit = async (parsedJob: any) => {
    try {
      await fetch('http://localhost:5050/api/jobs/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsedJob),
      });

      if (!state.isRunning) {
        controller.start();
      }

      if (parsedJob.volatility > 70) {
        setTimeout(() => controller.runDemoVolatilitySpike(), 1000);
      } else {
        setTimeout(() => controller.runDemoSteadyState(), 1000);
      }
    } catch (error) {
      console.error('Failed to submit job:', error);
    }
  };

  const handleSaveSession = async () => {
    try {
      const response = await fetch('http://localhost:5050/api/monitoring/save-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (data.success) {
        alert(`Session saved! ${data.rowCount} data points stored.`);

        // Refresh the reports list
        fetch("http://localhost:5050/api/reports")
          .then(res => res.json())
          .then(setReports)
          .catch(console.error);
      } else {
        alert('Failed to save session: ' + data.error);
      }
    } catch (error) {
      console.error('Save session error:', error);
      alert('Error saving session. Check console for details.');
    }
  };

  const handleGenerateReport = async (jobId: string) => {
    setReportModal({ show: true, report: '', jobId, loading: true });

    try {
      const response = await fetch(`http://localhost:5050/api/jobs/${jobId}/report`);
      const data = await response.json();

      if (data.success) {
        setReportModal({
          show: true,
          report: data.report,
          jobId: jobId,
          loading: false
        });

        // Refresh the past reports list, as we just created a new one
        fetch("http://localhost:5050/api/reports")
          .then(res => res.json())
          .then(setReports)
          .catch(console.error);

      } else {
        alert('Failed to generate report: ' + data.error);
        setReportModal({ show: false, report: '', jobId: '', loading: false });
      }
    } catch (error) {
      alert('Error generating report. Check console for details.');
      setReportModal({ show: false, report: '', jobId: '', loading: false });
    }
  };

  const handleViewPastReport = async (reportId: string) => {
    setPastSessionModal({ show: true, htmlContent: '', loading: true });

    try {
      const response = await fetch(`http://localhost:5050/api/reports/${reportId}/html`);

      if (!response.ok) {
        throw new Error("Failed to fetch report HTML");
      }

      const html = await response.text();

      setPastSessionModal({
        show: true,
        htmlContent: html,
        loading: false
      });

    } catch (error) {
      console.error(error);
      alert('Error viewing report.');
      setPastSessionModal({ show: false, htmlContent: '', loading: false });
    }
  }

  return (
    <div className="min-h-screen p-6 bg-[#0a0c10]">
      {/* Top Navigation / Status Bar */}
      <div className="relative flex items-center mb-8 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <div className="p-1 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
            <img src="/logo.png" alt="Latency Risk Logo" className="w-10 h-10 object-contain" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Latency-Aware AI Risk Infrastructure
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="flex items-center gap-1 text-[10px] text-gray-500 uppercase tracking-widest">
                <Activity className="w-3 h-3" /> System Status:
                <span className={state.isRunning ? 'text-green-400' : 'text-red-400'}>
                  {state.isRunning ? 'Active Monitoring' : 'Standby'}
                </span>
              </span>
              <span className="text-gray-700">|</span>
              <span className="text-[10px] text-gray-500 font-mono italic truncate max-w-[300px]">
                {state.lastAction}
              </span>
            </div>
          </div>
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 flex gap-3">
          <button
            onClick={state.isRunning ? handleStop : handleStart}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-sm transition-all ${state.isRunning
              ? 'bg-red-500/10 text-red-500 border border-red-500/50 hover:bg-red-500/20'
              : 'bg-cyan-500 text-black hover:bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.3)]'
              }`}
          >
            {state.isRunning ? <ZapOff className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {state.isRunning ? 'TERMINATE MONITORING' : 'INITIALIZE SYSTEM'}
          </button>

          {!state.isRunning && (
            <button
              onClick={handleSaveSession}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 transition-all text-sm font-bold"
            >
              <FileText className="w-4 h-4" />
              SAVE SESSION
            </button>
          )}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Column - Financial Risk Metrics */}
        {/* testing login */}
        <div style={{ position: "fixed", top: 10, right: 10 }}>
          {!isAuthenticated ? (
            <button
              onClick={() =>
                loginWithRedirect({
                  authorizationParams: {
                    audience: "https://latency-risk-api",
                    scope: "openid profile email",
                    prompt: "consent",
                    max_age: 0,
                  },
                })
              }
              className="px-3 py-1.5 text-xs rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
            >
              Log in
            </button>

          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 truncate max-w-[120px]">
                {user?.email}
              </span>

              <button
                onClick={async () => {
                  try {
                    console.log("➡️ Test Auth API clicked");

                    const token = await getAccessTokenSilently({
                      authorizationParams: {
                        audience: "https://latency-risk-api",
                        scope: "openid profile email",
                      },
                    });

                    console.log("✅ Got access token:", token.slice(0, 20) + "...");

                    const res = await fetch("http://localhost:5050/api/me", {
                      headers: {
                        Authorization: `Bearer ${token}`,
                      },
                    });

                    console.log("📡 Response status:", res.status);

                    const text = await res.text();
                    console.log("📦 Raw response:", text);

                    alert("Check console — API call completed");
                  } catch (err) {
                    console.error("❌ Test Auth API failed:", err);
                    alert("Test Auth API failed — check console");
                  }
                }}
                className="px-3 py-1.5 text-xs rounded bg-green-500/20 text-green-400 border border-green-500/30"
              >
                Test Auth API
              </button>

              <button
                onClick={() =>
                  logout({ logoutParams: { returnTo: window.location.origin } })
                }
                className="px-3 py-1.5 text-xs rounded bg-red-500/20 text-red-400 border border-red-500/30"
              >
                Log out
              </button>
            </div>
          )}
        </div>



        <div className="col-span-3 space-y-4">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-2 px-1">Financial Risk Metrics</div>
          <MetricCard
            title="p99 Latency"
            value={state.metrics.p99LatencyMs.toFixed(1)}
            unit="ms"
            icon={Gauge}
            status={state.metrics.p99LatencyMs > 50 ? 'critical' : 'healthy'}
            explainer="p99 Latency"
          />
          <MetricCard
            title="Risk Exposure"
            value={`$${state.metrics.riskExposure.toFixed(0)}`}
            icon={TrendingUp}
            status={state.metrics.riskExposure > 1000 ? 'critical' : 'healthy'}
            explainer="Risk Exposure"
          />
          <MetricCard
            title="SLO Violations"
            value={(state.metrics.sloViolationRate * 100).toFixed(1)}
            unit="%"
            icon={AlertTriangle}
            status={state.metrics.sloViolationRate > 0.05 ? 'critical' : 'healthy'}
            explainer="SLO Violations"
          />

          <div className="pt-4">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-2 px-1 text-right">Market Volatility</div>
            <div className="card bg-gradient-to-br from-gray-900 to-black border-gray-800">
              <div className="flex justify-between items-end mb-2">
                <span className="text-xs text-gray-500">Current Volatility</span>
                <span className={`text-xl font-mono font-bold ${state.volatility?.isSpike ? 'text-red-400' : 'text-cyan-400'}`}>
                  {((state.volatility?.currentVolatility || 0) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-1000 ${state.volatility?.isSpike ? 'bg-red-500' : 'bg-cyan-500'}`}
                  style={{ width: `${(state.volatility?.currentVolatility || 0) * 100}%` }}
                />
              </div>
              {state.volatility?.isSpike && (
                <div className="mt-3 flex items-center gap-2 text-[10px] text-red-400 animate-pulse">
                  <AlertTriangle className="w-3 h-3" />
                  {state.volatility.spikeReason}
                </div>
              )}
            </div>
          </div>

          <ActionCenter
            state={state}
            onOllama={handleOllama}
            onWebGPU={handleWebGPU}
            onToggleAuto={handleToggleAuto}
            onDemoSteady={handleDemoSteady}
            onDemoSpike={handleDemoSpike}
          />

          <div className="card">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Live Market Feed</h3>
            <div className="space-y-2">
              {state.volatility?.priceChanges.length === 0 ? (
                <div className="text-center py-4 text-gray-600 text-[10px]">Initializing feed...</div>
              ) : (
                <div className="space-y-1">
                  {['IBM', 'AAPL', 'GOOGL'].map(sym => (
                    <div key={sym} className="flex justify-between items-center p-2 bg-gray-800/20 rounded">
                      <span className="text-xs font-bold text-white">{sym}</span>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] text-gray-400">Live Quote</span>
                        <span className="text-xs text-cyan-400 font-mono">ACTIVE</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-xl">
            <div className="flex items-center gap-2 text-cyan-400 mb-2">
              <Brain className="w-4 h-4" />
              <span className="text-xs font-bold uppercase">System Intelligence</span>
            </div>
            <p className="text-[10px] text-gray-400 leading-relaxed">
              The system is currently using <span className="text-white font-bold">Cost-Aware Routing</span>.
              During volatility spikes, it automatically prioritizes critical risk checks by routing to
              <span className="text-cyan-400"> {state.cloudMetrics?.provider || 'Cloud APIs'}</span> while keeping non-critical tasks on
              <span className="text-green-400"> Local WebGPU</span> to minimize GPU costs.
            </p>
          </div>
        </div>

        <div className="col-span-6 space-y-6">
          <div className="card h-[350px] relative overflow-hidden">
            <div className="absolute top-4 left-4 right-4 z-10 flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-300">Tail Latency Distribution (Real-time)</h3>
                <p className="text-[10px] text-gray-500">Monitoring hardware response times across all inference paths</p>
              </div>
            </div>

            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={latencyHistory} margin={{ top: 60, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="p99Color" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="p50Color" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="time" hide />
                <YAxis stroke="#4b5563" fontSize={10} tickFormatter={(v) => `${v}ms`} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                  labelStyle={{ display: 'none' }}
                />
                <Area type="monotone" dataKey="p99" stroke="#ef4444" fillOpacity={1} fill="url(#p99Color)" name="p99 (Tail)" />
                <Area type="monotone" dataKey="p50" stroke="#22d3ee" fillOpacity={1} fill="url(#p50Color)" name="p50 (Median)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-6">
              <HardwareStatus state={state} activeJobs={activeJobs} />
              <CostOptimizer state={state} />
            </div>
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-300">Recent Inference Log</h3>
              </div>
              <div className="space-y-2 max-h-[180px] overflow-y-auto pr-2 custom-scrollbar">
                {state.recentResults.map((res) => (
                  <div key={res.id} className="flex items-center justify-between p-2 bg-gray-800/30 rounded border border-gray-700/50">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${res.sloViolated ? 'bg-red-500' : 'bg-green-500'}`} />
                      <span className="text-[10px] font-mono text-gray-400">{res.id.split('-')[0].toUpperCase()}</span>
                      <span className={`text-[8px] px-1 rounded ${res.cost > 0 ? 'bg-red-900/30 text-red-400' : 'bg-green-900/30 text-green-400'}`}>
                        {res.cost > 0 ? res.id.split('-')[0].toUpperCase() : 'LOCAL'}
                      </span>
                    </div>
                    <span className={`text-[10px] font-mono ${res.sloViolated ? 'text-red-400' : 'text-cyan-400'}`}>
                      {res.latencyMs.toFixed(1)}ms
                    </span>
                  </div>
                ))}
                {state.recentResults.length === 0 && <div className="text-center py-8 text-gray-600 text-xs italic">Waiting for inference requests...</div>}
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-3 space-y-4">
          <NaturalLanguageJobSubmission onJobSubmit={handleJobSubmit} />
          <JobQueue
            jobs={activeJobs}
            onGenerateReport={handleGenerateReport}
          />

          <PastMonitoringSessions
            reports={reports}
            onViewReport={handleViewPastReport}
          />
        </div>
      </div>

      <footer className="mt-12 pt-6 border-t border-gray-800 flex justify-between items-center text-gray-600 text-[10px] uppercase tracking-widest">
        <div>Finance × Cloud/AI Infra × Computer Architecture</div>
        <div className="flex gap-4">
          <span>WebGPU: {state.webGPUMetrics ? 'Active' : 'Standby'}</span>
          <span>Ollama: {state.ollamaMetrics ? 'Connected' : 'Disconnected'}</span>
          <span>Cloud: {state.cloudMetrics ? state.cloudMetrics.provider : 'Standby'}</span>
        </div>
      </footer>

      {reportModal.show && (
        <>
          {reportModal.loading ? (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
              <div className="bg-gray-900 border border-cyan-500/30 rounded-xl p-8 flex flex-col items-center gap-4">
                <Loader className="w-12 h-12 text-cyan-400 animate-spin" />
                <div className="text-white font-bold">Generating Executive Report...</div>
                <div className="text-xs text-gray-400">Gemini AI is analyzing your simulation results</div>
              </div>
            </div>
          ) : (
            <ExecutiveReportModal
              report={reportModal.report}
              jobId={reportModal.jobId}
              onClose={() => setReportModal({ show: false, report: '', jobId: '', loading: false })}
            />
          )}
        </>
      )}

      {pastSessionModal.show && (
        <>
          {pastSessionModal.loading ? (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
              <div className="bg-gray-900 border border-cyan-500/30 rounded-xl p-8 flex flex-col items-center gap-4">
                <Loader className="w-12 h-12 text-cyan-400 animate-spin" />
                <div className="text-white font-bold">Loading Session Data...</div>
              </div>
            </div>
          ) : (
            <PastSessionModal
              htmlContent={pastSessionModal.htmlContent}
              onClose={() => setPastSessionModal({ show: false, htmlContent: '', loading: false })}
            />
          )}
        </>
      )}
    </div>
  );
}

export default App;
