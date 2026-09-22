import { Router } from 'express';
import crypto from 'crypto';
import { generateExecutiveReport } from './reportGenerator';


const router = Router();

interface SimulationJob {
  id: string;
  type: string;
  volatility: number;
  depth: string;
  status: 'pending' | 'running' | 'completed';
  progress: number;
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

const jobs = new Map<string, SimulationJob>();

// Submit new job
router.post('/submit', async (req, res) => {
  const { jobType, volatility, depth, description } = req.body;

  const job: SimulationJob = {
    id: crypto.randomUUID(),
    type: jobType,
    volatility,
    depth,
    status: 'pending',
    progress: 0,
    submittedAt: Date.now(),
  };

  jobs.set(job.id, job);

  console.log(`📋 Job submitted: ${job.id} - ${description}`);

  // Start processing asynchronously
  processJob(job.id, volatility);

  res.json({ success: true, jobId: job.id, job });
});

// Get specific job
router.get('/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json(job);
});

// Get all jobs
router.get('/', (req, res) => {
  const allJobs = Array.from(jobs.values()).sort((a, b) => b.submittedAt - a.submittedAt);
  res.json(allJobs);
});

// Simulate job processing
async function processJob(jobId: string, volatility: number) {
  const job = jobs.get(jobId);
  if (!job) return;

  job.status = 'running';

  // Simulate progressive computation
  for (let i = 0; i <= 100; i += 10) {
    await new Promise(resolve => setTimeout(resolve, 500)); // 500ms per step
    job.progress = i;

    console.log(`⚙️ Job ${jobId}: ${i}% complete`);
  }

  // Calculate execution time
  const executionTimeSeconds = (Date.now() - job.submittedAt) / 1000;

  // Generate realistic results based on volatility
  const baseLatency = 50 + volatility * 10;
  const jitter = Math.random() * 20;

  // Calculate HPC scale metrics with jitter for realism
  const scenariosBase = job.depth === 'deep' ? 10000000 :
    job.depth === 'standard' ? 1000000 :
      100000;

  // Add +/- 10% jitter to scenarios
  const scenariosSimulated = Math.floor(scenariosBase * (0.9 + Math.random() * 0.2));
  const dataPointsProcessed = scenariosSimulated * 50;

  // IMPROVED: Dynamic workers based on depth AND volatility with small variance
  let baseWorkers = job.depth === 'deep' ? 128 :
    job.depth === 'standard' ? 96 :
      64;

  if (volatility > 70) {
    baseWorkers = 120 + Math.floor(Math.random() * 16);
  } else if (volatility > 40) {
    baseWorkers = 88 + Math.floor(Math.random() * 12);
  } else {
    baseWorkers = 60 + Math.floor(Math.random() * 8);
  }

  const parallelWorkers = baseWorkers;

  const peakThroughput = Math.floor((scenariosSimulated / executionTimeSeconds) * (0.95 + Math.random() * 0.1));
  const totalComputeSeconds = parallelWorkers * executionTimeSeconds;
  const sequentialTimeMinutes = Math.floor(totalComputeSeconds / 60);
  const speedup = parseFloat((parallelWorkers * (0.98 + Math.random() * 0.04)).toFixed(1));

  // Compute distribution (based on volatility and depth)
  const localPercentage = volatility > 70 ? 40 :
    volatility > 40 ? 60 :
      80;
  const cloudPercentage = 100 - localPercentage;

  job.status = 'completed';
  job.completedAt = Date.now();
  job.results = {
    p99Latency: baseLatency + jitter,
    riskScore: Math.min(100, volatility * 1.2 + Math.random() * 10),
    sloViolations: Math.min(20, volatility / 5 + Math.random() * 5),
    estimatedSlippage: (volatility * 0.01) * (1 + Math.random()),

    // NEW: HPC Scale Metrics
    hpcMetrics: {
      scenariosSimulated,
      dataPointsProcessed,
      parallelWorkers,
      peakThroughput,
      executionTimeSeconds: parseFloat(executionTimeSeconds.toFixed(1)),
      sequentialTimeMinutes,
      speedup,
      localPercentage,
      cloudPercentage,
      localCost: 0,
      cloudCost: parseFloat(((cloudPercentage / 100) * 0.05).toFixed(4))
    }
  };

  console.log(`✅ Job ${jobId} completed with p99=${job.results.p99Latency.toFixed(1)}ms, ${scenariosSimulated.toLocaleString()} scenarios, ${speedup}x speedup`);
}

// Generate executive report for a job
router.get('/:jobId/report', async (req, res) => {
  try {
    const job = jobs.get(req.params.jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'completed') {
      return res.status(400).json({ error: 'Job must be completed to generate report' });
    }

    console.log(`📊 Generating executive report for job ${req.params.jobId}...`);

    const report = await generateExecutiveReport(job);

    console.log(`✅ Report generated successfully`);

    res.json({
      success: true,
      report,
      generatedAt: Date.now()
    });

  } catch (error: any) {
    console.error('Report generation error:', error);
    res.status(500).json({
      error: 'Failed to generate report',
      message: error.message
    });
  }
});

export default router;