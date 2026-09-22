// WebGPU-based real GPU compute for measuring actual hardware latency
// This runs actual matrix multiplication and Monte Carlo simulations on the GPU

export interface WebGPUCapabilities {
    available: boolean;
    adapterName: string;
    deviceLimits: {
        maxComputeWorkgroupSizeX: number;
        maxBufferSize: number;
    };
}

export interface ComputeResult {
    latencyMs: number;
    operationsPerSecond: number;
    matrixSize?: number;
    samples?: number;
    gpuName: string;
    type: 'MatrixMult' | 'MonteCarlo';
}

// Check if WebGPU is available
export async function checkWebGPU(): Promise<WebGPUCapabilities> {
    if (!navigator.gpu) {
        return {
            available: false,
            adapterName: 'WebGPU not supported',
            deviceLimits: { maxComputeWorkgroupSizeX: 0, maxBufferSize: 0 },
        };
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        return {
            available: false,
            adapterName: 'No GPU adapter found',
            deviceLimits: { maxComputeWorkgroupSizeX: 0, maxBufferSize: 0 },
        };
    }

    const device = await adapter.requestDevice();
    const info = adapter.info;

    return {
        available: true,
        adapterName: info?.description || info?.vendor || 'Unknown GPU',
        deviceLimits: {
            maxComputeWorkgroupSizeX: device.limits.maxComputeWorkgroupSizeX,
            maxBufferSize: device.limits.maxBufferSize,
        },
    };
}

// WebGPU compute shader for matrix multiplication
const MATRIX_MULT_SHADER = `
@group(0) @binding(0) var<storage, read> a: array<f32>;
@group(0) @binding(1) var<storage, read> b: array<f32>;
@group(0) @binding(2) var<storage, read_write> result: array<f32>;

struct Uniforms {
  size: u32,
}
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let row = global_id.x;
  let col = global_id.y;
  let size = uniforms.size;
  
  if (row >= size || col >= size) {
    return;
  }
  
  var sum: f32 = 0.0;
  for (var k: u32 = 0u; k < size; k = k + 1u) {
    sum = sum + a[row * size + k] * b[k * size + col];
  }
  result[row * size + col] = sum;
}
`;

// WebGPU compute shader for Monte Carlo Option Pricing
const MONTE_CARLO_SHADER = `
struct Params {
  s0: f32,      // Initial stock price
  k: f32,       // Strike price
  r: f32,       // Risk-free rate
  v: f32,       // Volatility
  t: f32,       // Time to maturity
  samples: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> payoffs: array<f32>;

// Simple PCG random number generator
fn pcg_hash(input: u32) -> u32 {
    var state = input * 747796405u + 2891336453u;
    var word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
    return (word >> 22u) ^ word;
}

fn rand_f32(seed: u32) -> f32 {
    return f32(pcg_hash(seed)) / 4294967296.0;
}

// Box-Muller transform for normal distribution
fn box_muller(seed: u32) -> f32 {
    let u1 = rand_f32(seed);
    let u2 = rand_f32(pcg_hash(seed));
    return sqrt(-2.0 * log(max(u1, 1e-7))) * cos(6.283185307 * u2);
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let idx = global_id.x;
    if (idx >= params.samples) { return; }

    let drift = (params.r - 0.5 * params.v * params.v) * params.t;
    let diffusion = params.v * sqrt(params.t) * box_muller(idx);
    let st = params.s0 * exp(drift + diffusion);
    
    payoffs[idx] = max(st - params.k, 0.0);
}
`;

// GPU compute engine class
export class WebGPUCompute {
    private device: GPUDevice | null = null;
    private matrixPipeline: GPUComputePipeline | null = null;
    private mcPipeline: GPUComputePipeline | null = null;
    private adapterName: string = 'Unknown';
    private initialized: boolean = false;

    async initialize(): Promise<boolean> {
        if (!navigator.gpu) {
            console.warn('WebGPU not supported');
            return false;
        }

        try {
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                console.warn('No GPU adapter');
                return false;
            }

            const info = adapter.info;
            this.adapterName = info?.description || info?.vendor || 'WebGPU Device';

            this.device = await adapter.requestDevice();

            // Matrix Pipeline
            const matrixModule = this.device.createShaderModule({
                code: MATRIX_MULT_SHADER,
            });

            this.matrixPipeline = this.device.createComputePipeline({
                layout: 'auto',
                compute: {
                    module: matrixModule,
                    entryPoint: 'main',
                },
            });

            // Monte Carlo Pipeline
            const mcModule = this.device.createShaderModule({ code: MONTE_CARLO_SHADER });
            this.mcPipeline = this.device.createComputePipeline({
                layout: 'auto',
                compute: { module: mcModule, entryPoint: 'main' },
            });

            this.initialized = true;
            return true;
        } catch (error) {
            console.error('WebGPU init failed:', error);
            return false;
        }
    }

    async runMatrixMult(size: number = 256): Promise<ComputeResult | null> {
        if (!this.initialized || !this.device || !this.matrixPipeline) return null;

        const elements = size * size;
        const byteSize = elements * 4;

        // Create random matrices
        const matrixA = new Float32Array(elements);
        const matrixB = new Float32Array(elements);
        for (let i = 0; i < elements; i++) {
            matrixA[i] = Math.random();
            matrixB[i] = Math.random();
        }

        // Create GPU buffers
        const bufferA = this.device.createBuffer({
            size: byteSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        const bufferB = this.device.createBuffer({
            size: byteSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        const bufferResult = this.device.createBuffer({
            size: byteSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        const uniformBuffer = this.device.createBuffer({
            size: 4, // single u32
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Write data to GPU
        this.device.queue.writeBuffer(bufferA, 0, matrixA);
        this.device.queue.writeBuffer(bufferB, 0, matrixB);
        this.device.queue.writeBuffer(uniformBuffer, 0, new Uint32Array([size]));

        // Create bind group
        const bindGroup = this.device.createBindGroup({
            layout: this.matrixPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: bufferA } },
                { binding: 1, resource: { buffer: bufferB } },
                { binding: 2, resource: { buffer: bufferResult } },
                { binding: 3, resource: { buffer: uniformBuffer } },
            ],
        });

        // Record commands
        const commandEncoder = this.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();
        passEncoder.setPipeline(this.matrixPipeline);
        passEncoder.setBindGroup(0, bindGroup);

        const workgroupSize = 16;
        const workgroupsX = Math.ceil(size / workgroupSize);
        const workgroupsY = Math.ceil(size / workgroupSize);
        passEncoder.dispatchWorkgroups(workgroupsX, workgroupsY);
        passEncoder.end();

        // Start timing
        const startTime = performance.now();

        // Submit and wait
        this.device.queue.submit([commandEncoder.finish()]);
        await this.device.queue.onSubmittedWorkDone();

        const endTime = performance.now();
        const latencyMs = endTime - startTime;

        // Calculate FLOPS: matrix mult = 2*n^3 operations
        const operations = 2 * size * size * size;
        const operationsPerSecond = operations / (latencyMs / 1000);

        return {
            latencyMs,
            operationsPerSecond,
            matrixSize: size,
            gpuName: this.adapterName,
            type: 'MatrixMult'
        };
    }

    async runMonteCarlo(samples: number = 1000000): Promise<ComputeResult | null> {
        if (!this.initialized || !this.device || !this.mcPipeline) return null;

        const payoffBuffer = this.device.createBuffer({
            size: samples * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });

        const paramBuffer = this.device.createBuffer({
            size: 24, // 5 f32 + 1 u32
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // S0, K, R, V, T, Samples
        const params = new Float32Array([100.0, 105.0, 0.05, 0.2, 1.0]);
        this.device.queue.writeBuffer(paramBuffer, 0, params);
        this.device.queue.writeBuffer(paramBuffer, 20, new Uint32Array([samples]));

        const bindGroup = this.device.createBindGroup({
            layout: this.mcPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: paramBuffer } },
                { binding: 1, resource: { buffer: payoffBuffer } },
            ],
        });

        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(this.mcPipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(Math.ceil(samples / 256));
        pass.end();

        const start = performance.now();
        this.device.queue.submit([encoder.finish()]);
        await this.device.queue.onSubmittedWorkDone();
        const latencyMs = performance.now() - start;

        return {
            latencyMs,
            operationsPerSecond: (samples * 50) / (latencyMs / 1000), // Approx 50 ops per sample
            samples,
            gpuName: this.adapterName,
            type: 'MonteCarlo'
        };
    }

    isInitialized(): boolean { return this.initialized; }
    getAdapterName(): string { return this.adapterName; }
}

// Singleton instance
let webGPUInstance: WebGPUCompute | null = null;

export async function getWebGPU(): Promise<WebGPUCompute | null> {
    if (!webGPUInstance) {
        webGPUInstance = new WebGPUCompute();
        if (!(await webGPUInstance.initialize())) webGPUInstance = null;
    }
    return webGPUInstance;
}
