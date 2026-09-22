import express from "express";
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import { estimateSlippage } from "./slippage";
import crypto from "crypto";
import { initDB } from "./db";
import jobsRouter from './jobs';
import { MongoClient, ObjectId } from "mongodb";
import { getReportsCollection } from "./db";


import fs from "fs";
import os from "os";
import path from "path";

import {
  recordLatency,
  recordInference,
  getLatencySamples,
  InferenceRecord,
  getInferenceLog,
  clearLatencySamples,
  clearInferenceLog
} from "./storage";

// ==========================
// System State
// ==========================

import { Simulation } from "./types";

interface SystemState {
  monitoring: boolean;
  volatility: number;
  routing: "LOCAL" | "CLOUD";
  hasSavedReport: boolean;

  activeSimulation: Simulation | null;
  completedSimulations: Simulation[];
}

const systemState: SystemState = {
  monitoring: false,
  volatility: 0,
  routing: "LOCAL",
  hasSavedReport: false,

  activeSimulation: null,
  completedSimulations: [],
};

// ==========================
// Helpers
// ==========================

function simulateLatency(volatility: number): number {
  const base = 80;
  const jitter = Math.random() * 40;

  if (Math.random() < volatility) {
    return base + 800 + Math.random() * 600;
  }

  return base + jitter;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor(p * sorted.length);
  return sorted[Math.min(index, sorted.length - 1)];
}

type CombinedRow = {
  timestamp: string;
  p50_ms: string;
  p99_ms: string;
  sample_count: number;
  latency_ms: string; // "" if none
  provider: string; // "" if none
  slo_violated: string; // "" if none
  estimated_slippage_usd: string;
  slippage_confidence: string;
};

function buildCombinedRows(): CombinedRow[] {
  const latencySamples = getLatencySamples();
  const inferenceRecords: InferenceRecord[] = getInferenceLog();

  const windowMs = 10_000;

  if (latencySamples.length === 0) return [];

  const latencySorted = [...latencySamples].sort((a, b) => a.timestamp - b.timestamp);
  const inferenceSorted = [...inferenceRecords].sort((a, b) => a.timestamp - b.timestamp);

  const start = Math.floor(latencySorted[0].timestamp / 1000) * 1000;
  const end = Math.floor(latencySorted[latencySorted.length - 1].timestamp / 1000) * 1000;

  let latencyLeft = 0;
  let inferenceIdx = 0;

  const rows: CombinedRow[] = [];

  for (let t = start; t <= end; t += 1000) {
    const windowStart = t - windowMs;

    while (latencyLeft < latencySorted.length && latencySorted[latencyLeft].timestamp < windowStart) {
      latencyLeft++;
    }

    const windowVals: number[] = [];
    for (let i = latencyLeft; i < latencySorted.length; i++) {
      if (latencySorted[i].timestamp > t) break;
      windowVals.push(latencySorted[i].latencyMs);
    }

    if (windowVals.length === 0) continue;

    // ---- Inference aligned to this second ----
    let inferenceLatency = "";
    let provider = "";
    let sloViolated = "";

    while (inferenceIdx < inferenceSorted.length && inferenceSorted[inferenceIdx].timestamp < t) {
      inferenceIdx++;
    }

    if (inferenceIdx < inferenceSorted.length && inferenceSorted[inferenceIdx].timestamp < t + 1000) {
      const r = inferenceSorted[inferenceIdx];

      inferenceLatency = r.latencyMs.toFixed(2);
      provider = r.provider === "CLOUD" ? "groq" : "local";
      sloViolated = String(r.sloViolated).toUpperCase();
    }

    const p50 = percentile(windowVals, 0.5).toFixed(2);
    const p99 = percentile(windowVals, 0.99).toFixed(2);

    const slippage = estimateSlippage(
      percentile(windowVals, 0.99),
      systemState.volatility,
      windowVals.length
    );

    rows.push({
      timestamp: new Date(t).toISOString(),
      p50_ms: p50,
      p99_ms: p99,
      sample_count: windowVals.length,
      latency_ms: inferenceLatency,
      provider,
      slo_violated: sloViolated,
      estimated_slippage_usd: slippage.estimatedSlippageUsd.toFixed(6),
      slippage_confidence: String(slippage.confidence)
    });
  }

  return rows;
}

function buildHtmlSnapshotReport() {
  const rows = buildCombinedRows();
  if (rows.length === 0) return null;

  const samples = getLatencySamples().map(s => s.latencyMs);
  if (samples.length === 0) return null;

  const p99 = percentile(samples, 0.99);
  const mean =
    samples.reduce((a, b) => a + b, 0) / samples.length;

  const slippage = estimateSlippage(
    p99,
    systemState.volatility,
    samples.length
  );

  return {
    createdAt: new Date(),
    p99LatencyMs: p99,
    meanLatencyMs: mean,
    riskExposureUsd: slippage.estimatedSlippageUsd,
    worstCaseLossUsd: slippage.estimatedSlippageUsd,
    scenarioCount: samples.length,
    htmlReport: renderCombinedHtml(rows),
    metadata: {
      routing: systemState.routing
    }
  };
}

function formatUSD(value: string | number) {
  const num = typeof value === "string" ? Number(value) : value;

  if (!Number.isFinite(num)) return "";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2
  }).format(num);
}


function escapeHtml(input: unknown) {
  const s = String(input ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderCombinedHtml(rows: CombinedRow[]) {
  const css = `
    :root {
      --bg: #0b1020;
      --panel: #0f172a;
      --text: #e5e7eb;
      --muted: #94a3b8;
      --border: rgba(148,163,184,.2);
      --goodBg: rgba(34,197,94,.15);
      --goodText: rgb(74,222,128);
      --badBg: rgba(239,68,68,.15);
      --badText: rgb(248,113,113);
    }
    body { margin:0; background: var(--bg); color: var(--text); font-family: ui-sans-serif, system-ui; }
    .wrap { padding: 24px; max-width: 1200px; margin: 0 auto; }
    h1 { margin: 0 0 8px; font-size: 20px; }
    .sub { color: var(--muted); margin-bottom: 16px; font-size: 13px; }
    .card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 12px; border-bottom: 1px solid var(--border); font-size: 13px; }
    th { text-align: left; color: var(--muted); font-weight: 600; background: rgba(255,255,255,.02); position: sticky; top: 0; }
    tr:hover td { background: rgba(255,255,255,.03); }
    .badge { display:inline-block; padding: 2px 8px; border-radius: 999px; font-weight: 700; font-size: 12px; }
    .ok { background: var(--goodBg); color: var(--goodText); }
    .bad { background: var(--badBg); color: var(--badText); }
    .num { font-variant-numeric: tabular-nums; }
  `;

  const now = new Date().toISOString();

  const rowsHtml = rows
    .map(r => {
      const badge =
        r.slo_violated === "TRUE"
          ? `<span class="badge bad">SLO VIOLATION</span>`
          : r.slo_violated === "FALSE"
            ? `<span class="badge ok">OK</span>`
            : "";

      return `
        <tr>
          <td class="num">${escapeHtml(r.timestamp)}</td>
          <td class="num">${escapeHtml(r.p50_ms)}</td>
          <td class="num">${escapeHtml(r.p99_ms)}</td>
          <td class="num">${r.sample_count}</td>
          <td class="num">${escapeHtml(r.latency_ms || "")}</td>
          <td>${escapeHtml(r.provider || "")}</td>
          <td>${badge}</td>
          <td class="num">${formatUSD(r.estimated_slippage_usd)}</td>
        </tr>
      `;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Combined Metrics Report</title>
  <style>${css}</style>
</head>
<body>
  <div class="wrap">
    <h1>Combined Metrics Report</h1>
    <div class="sub">Generated: ${escapeHtml(now)} • Rows: ${rows.length}</div>
    <div class="card">
      <table>
        <thead>
          <tr>
            <th>timestamp</th>
            <th>p50_ms</th>
            <th>p99_ms</th>
            <th>sample_count</th>
            <th>latency_ms</th>
            <th>provider</th>
            <th>slo</th>
            <th>estimated_slippage_usd</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml ||
    `<tr><td colspan="8" style="color: var(--muted);">No data</td></tr>`
    }
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}

/*
function saveCombinedHtmlReportToDisk() {
  const rows = buildCombinedRows();
  const html = renderCombinedHtml(rows);

  const downloadsDir = path.join(os.homedir(), "Downloads");
  const filename = `combined_metrics_${new Date().toISOString().replaceAll(":", "-")}.html`;
  const outPath = path.join(downloadsDir, filename);

  fs.writeFileSync(outPath, html, "utf8");
  console.log(`[report] wrote HTML report to ${outPath}`);
}
*/

// ==========================
// App Setup
// ==========================

const app = express();

app.use((req, _res, next) => {
  console.log("INCOMING REQUEST:", req.method, req.path);
  next();
});

app.use(express.json());
app.use(cors());

app.use('/api/jobs', jobsRouter);


// ==========================
// Health & Status
// ==========================

app.get("/health", (_req, res) => {
  res.json({ status: "OK" });
});

app.get("/api/status", (_req, res) => {
  res.json(systemState);
});

app.post("/api/monitoring/start", (_req, res) => {
  systemState.monitoring = true;
  systemState.hasSavedReport = false;
  res.json({ monitoring: true });
});

// NOTE: "stop" now means stop monitoring (does NOT clear data)
import { saveRiskReport } from "./db";

app.post("/api/monitoring/stop", async (_req, res) => {
  console.log("🛑 /api/monitoring/stop HIT");

  // 1️⃣ Stop monitoring
  systemState.monitoring = false;

  // 2️⃣ MARK ACTIVE SIMULATION AS COMPLETED
  if (systemState.activeSimulation) {
    systemState.activeSimulation.status = "COMPLETED";
    systemState.activeSimulation.endedAt = Date.now();

    console.log(
      "✅ Simulation completed:",
      systemState.activeSimulation.id
    );

    // Optional: archive it
    systemState.completedSimulations.push(systemState.activeSimulation);
    systemState.activeSimulation = null;
  }

  // NOTE: Removed auto-save - now manual via /api/monitoring/save-session

  res.json({ monitoring: false });
});


// NEW: explicit reset endpoint clears stored samples/logs
app.post("/api/monitoring/reset", (_req, res) => {
  clearLatencySamples();
  clearInferenceLog();
  res.json({ status: "reset" });
});

// NEW: Manual save session endpoint
app.post("/api/monitoring/save-session", async (_req, res) => {
  try {
    console.log("💾 /api/monitoring/save-session HIT");

    if (systemState.hasSavedReport) {
      console.warn("⚠️ Session already saved, preventing duplicate.");
      return res.status(409).json({ error: "Session already saved" });
    }

    const rows = buildCombinedRows();

    if (rows.length === 0) {
      return res.status(400).json({ error: "No data to save" });
    }

    // Calculate summary stats
    const p99Values = rows.map(r => parseFloat(r.p99_ms)).filter(v => !isNaN(v));
    const slippageValues = rows.map(r => parseFloat(r.estimated_slippage_usd)).filter(v => !isNaN(v));

    const avgP99 = p99Values.length > 0
      ? p99Values.reduce((a, b) => a + b, 0) / p99Values.length
      : 0;

    const maxSlippage = slippageValues.length > 0
      ? Math.max(...slippageValues)
      : 0;

    const totalSamples = rows.reduce((sum, r) => sum + r.sample_count, 0);

    // Get first and last timestamps
    const sessionStartedAt = new Date(rows[0].timestamp);
    const sessionEndedAt = new Date(rows[rows.length - 1].timestamp);

    const session = {
      sessionStartedAt,
      sessionEndedAt,
      metricsData: rows,
      summary: {
        totalSamples,
        avgP99,
        maxSlippage
      }
    };

    // Save to MongoDB
    const collection = getReportsCollection();
    const result = await collection.insertOne(session);

    // Mark as saved
    systemState.hasSavedReport = true;

    console.log(`✅ Session saved with ID: ${result.insertedId}`);

    res.json({
      success: true,
      sessionId: result.insertedId,
      rowCount: rows.length
    });

  } catch (error: any) {
    console.error("❌ Failed to save session:", error);
    res.status(500).json({ error: "Failed to save session", message: error.message });
  }
});


app.get("/api/reports", async (_req, res) => {
  const collection = getReportsCollection();

  const reports = await collection
    .find(
      {},
      {
        projection: { htmlReport: 0, metricsData: 0 } // exclude huge fields
      }
    )
    .sort({ sessionStartedAt: -1, createdAt: -1 }) // Sort by session time
    .toArray();

  res.json(reports);
});

app.get("/api/reports/:id/html", async (req, res) => {
  try {
    const collection = getReportsCollection();

    const report = await collection.findOne({
      _id: new ObjectId(req.params.id)
    });

    if (!report) {
      return res.status(404).send("Report not found");
    }

    let html = "";
    if (report.metricsData) {
      // Dynamic generation from stored metrics
      html = renderCombinedHtml(report.metricsData);
    } else if (report.htmlReport) {
      // Legacy support
      html = report.htmlReport;
    } else {
      return res.status(400).send("No report data available");
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error generating report");
  }
});

// ==========================
// Metrics Endpoint (graph driver)
// ==========================

app.get("/api/metrics", (_req, res) => {
  // If monitoring is off, return zeros (frontend reset-safe)
  if (!systemState.monitoring) {
    return res.json({
      p50: 0,
      p95: 0,
      p99: 0,
      sloViolationRate: 0,
      sampleCount: 0,
      estimatedSlippageUsd: 0,
      slippageConfidence: 0
    });
  }

  // Simulate latency for this tick
  const latency = simulateLatency(systemState.volatility);

  // Persist latency sample (audit trail)
  recordLatency(latency, systemState.volatility);

  // Determine SLO violation
  const sloThreshold = 1000; // ms
  const sloViolated = latency > sloThreshold;

  // Decide routing (local vs cloud)
  const hardware: "CPU" | "CLOUD" =
    latency > 800 || systemState.routing === "CLOUD" ? "CLOUD" : "CPU";

  // Record inference event
  recordInference({
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    latencyMs: latency,
    provider: latency > 800 || systemState.routing === "CLOUD" ? "CLOUD" : "LOCAL",
    cost: latency > 800 ? 0.0008 : 0,
    sloViolated
  });

  // Compute metrics from stored samples
  const samples = getLatencySamples().map(s => s.latencyMs);

  const p50 = percentile(samples, 0.5);
  const p95 = percentile(samples, 0.95);
  const p99 = percentile(samples, 0.99);

  const violations = samples.filter(v => v > sloThreshold).length;

  // Estimate financial slippage
  const slippage = estimateSlippage(
    p99, // tail latency proxy
    systemState.volatility, // market stress
    samples.length // confidence proxy
  );

  // Return unified metrics
  res.json({
    p50,
    p95,
    p99,
    sloViolationRate: samples.length ? violations / samples.length : 0,
    sampleCount: samples.length,
    estimatedSlippageUsd: slippage.estimatedSlippageUsd,
    slippageConfidence: slippage.confidence
  });
});

// ==========================
// CSV EXPORTS
// ==========================

// Backwards compatibility
app.get("/api/export/latency.csv", (_req, res) => {
  res.redirect("/api/export/latency_timeseries.csv");
});

/**
 * 1) Rolling-window latency timeseries (matches graph)
 */
app.get("/api/export/latency_timeseries.csv", (_req, res) => {
  const samples = getLatencySamples();
  const windowMs = 10_000; // 10s rolling window

  if (samples.length === 0) {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=latency_timeseries.csv");
    return res.send("timestamp,p50_ms,p95_ms,p99_ms,sample_count\n");
  }

  const sorted = [...samples].sort((a, b) => a.timestamp - b.timestamp);
  const start = Math.floor(sorted[0].timestamp / 1000) * 1000;
  const end = Math.floor(sorted[sorted.length - 1].timestamp / 1000) * 1000;

  const header = "timestamp,p50_ms,p95_ms,p99_ms,sample_count\n";
  const rows: string[] = [];

  let left = 0;

  for (let t = start; t <= end; t += 1000) {
    const windowStart = t - windowMs;

    while (left < sorted.length && sorted[left].timestamp < windowStart) {
      left++;
    }

    const windowVals: number[] = [];
    for (let i = left; i < sorted.length; i++) {
      if (sorted[i].timestamp > t) break;
      windowVals.push(sorted[i].latencyMs);
    }

    if (windowVals.length === 0) continue;

    rows.push(
      [
        new Date(t).toISOString(),
        percentile(windowVals, 0.5).toFixed(2),
        percentile(windowVals, 0.95).toFixed(2),
        percentile(windowVals, 0.99).toFixed(2),
        windowVals.length
      ].join(",")
    );
  }

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=latency_timeseries.csv");
  res.send(header + rows.join("\n"));
});

/**
 * Combined CSV (rolling window + aligned inference + slippage)
 */
app.get("/api/export/combined.csv", (_req, res) => {
  const header =
    "timestamp,p50_ms,p99_ms,sample_count,latency_ms,provider,slo_violated,estimated_slippage_usd,slippage_confidence\n";

  const combined = buildCombinedRows();

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=combined_metrics.csv");

  if (combined.length === 0) return res.send(header);

  const body = combined
    .map(r =>
      [
        r.timestamp,
        r.p50_ms,
        r.p99_ms,
        r.sample_count,
        r.latency_ms,
        r.provider,
        r.slo_violated,
        r.estimated_slippage_usd,
        r.slippage_confidence
      ].join(",")
    )
    .join("\n");

  res.send(header + body + "\n");
});

/**
 * NEW: Styled HTML export (download a designed report)
 */
app.get("/api/export/combined.html", (_req, res) => {
  const rows = buildCombinedRows();
  const html = renderCombinedHtml(rows);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=combined_metrics.html");
  res.send(html);
});


/**
 * 2) Raw latency samples
 */
app.get("/api/export/latency_raw.csv", (_req, res) => {
  const samples = getLatencySamples();

  const header = "timestamp,latency_ms,volatility\n";
  const rows = samples
    .map(s => `${new Date(s.timestamp).toISOString()},${s.latencyMs},${s.volatility}`)
    .join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=latency_raw.csv");

  res.send(header + rows);
});

/**
 * 3) Inference log (LOCAL vs CLOUD/Groq)
 */
app.get("/api/export/inference.csv", (_req, res) => {
  const records = getInferenceLog();

  const header = "id,timestamp,latency_ms,provider,cost_usd,slo_violated\n";

  const rows = records
    .map(r =>
      [
        r.id,
        new Date(r.timestamp).toISOString(),
        r.latencyMs,
        r.provider === "CLOUD" ? "groq" : "local",
        r.cost.toFixed(6),
        r.sloViolated
      ].join(",")
    )
    .join("\n");

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=inference_log.csv");

  res.send(header + rows);
});

// ==========================
// Server
// ==========================

const PORT = 5050;

async function startServer() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI not set in environment");
  }

  const client = new MongoClient(uri);
  await client.connect();

  const database = client.db("latency_risk");
  initDB(database);

  console.log("📦 Connected to MongoDB database: latency_risk");

  app.listen(PORT, () => {
    console.log(`🚀 Backend running on http://localhost:${PORT}`);
  });
}

startServer().catch((err: Error) => {
  console.error("❌ Failed to start server:", err);
  process.exit(1);
});