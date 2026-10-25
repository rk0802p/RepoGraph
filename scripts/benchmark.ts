/**
 * RepoGraph Performance & Architectural Benchmark Suite
 *
 * Measures:
 * 1. Tree-sitter AST parsing throughput (lines/sec, files/sec, latency distribution)
 * 2. Dependency Graph Construction & Import Resolution latency
 * 3. Reverse BFS Change-Impact Analysis latency across graph nodes
 * 4. Identifier & Symbol Search latency across full repository AST
 * 5. Memory usage & heap allocations (RSS, heapUsed, external)
 */

import os from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { scanRepository } from '../services/api/src/services/repositoryScanner.js';
import { parseCode } from '../services/api/src/services/codeParser.js';
import { resolveImports } from '../services/api/src/services/importResolver.js';
import { buildDependencyGraph } from '../services/api/src/services/dependencyGraph.js';
import { analyzeChangeImpact } from '../services/api/src/services/impactAnalyzer.js';

interface LatencyStats {
  minMs: number;
  maxMs: number;
  meanMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
}

function calculateStats(samples: number[]): LatencyStats {
  if (samples.length === 0) {
    return { minMs: 0, maxMs: 0, meanMs: 0, p50Ms: 0, p90Ms: 0, p95Ms: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p90 = sorted[Math.floor(sorted.length * 0.90)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];

  return {
    minMs: Number(sorted[0].toFixed(3)),
    maxMs: Number(sorted[sorted.length - 1].toFixed(3)),
    meanMs: Number((sum / sorted.length).toFixed(3)),
    p50Ms: Number(p50.toFixed(3)),
    p90Ms: Number(p90.toFixed(3)),
    p95Ms: Number(p95.toFixed(3)),
  };
}

async function runBenchmark() {
  console.log('\n================================================================');
  console.log('📊 REPO GRAPH BENCHMARK & PERFORMANCE EVALUATION SUITE');
  console.log('================================================================');

  const repoRoot = path.resolve(process.cwd());
  const envInfo = {
    platform: `${os.platform()} ${os.release()} (${os.arch()})`,
    nodeVersion: process.version,
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model || 'Unknown',
    totalMemoryMB: Math.round(os.totalmem() / (1024 * 1024)),
    timestamp: new Date().toISOString(),
  };

  console.log(`Node.js:      ${envInfo.nodeVersion}`);
  console.log(`OS:           ${envInfo.platform}`);
  console.log(`CPU:          ${envInfo.cpuModel} (${envInfo.cpus} cores)`);
  console.log(`RAM:          ${envInfo.totalMemoryMB} MB`);
  console.log(`Repository:   ${repoRoot}\n`);

  const memInitial = process.memoryUsage();

  // 1. Repository File Discovery
  const tScanStart = performance.now();
  const files = await scanRepository(repoRoot);
  const tScanEnd = performance.now();
  const scanDurationMs = tScanEnd - tScanStart;

  console.log(`🔍 [Benchmark 1: Repository Scan]`);
  console.log(`   - Discovered:   ${files.length} supported source files`);
  console.log(`   - Scan Latency: ${scanDurationMs.toFixed(2)} ms\n`);

  // Load file contents
  let totalLines = 0;
  let totalBytes = 0;
  const fileData: Array<{ path: string; extension: string; language: string; content: string; lines: number }> = [];

  for (const f of files) {
    const fullPath = path.resolve(repoRoot, f.path);
    const content = await readFile(fullPath, 'utf8');
    const lines = content.split(/\r?\n/).length;
    totalLines += lines;
    totalBytes += Buffer.byteLength(content, 'utf8');
    fileData.push({
      path: f.path,
      extension: f.extension,
      language: f.language,
      content,
      lines,
    });
  }

  // 2. Tree-sitter AST Parsing Benchmark (5 iterations)
  console.log(`⚡ [Benchmark 2: Tree-sitter AST Parsing Throughput]`);
  const ITERATIONS = 5;
  const parseLatenciesPerFile: number[] = [];
  let totalParseDurationMs = 0;
  let totalSymbolsExtracted = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const t0 = performance.now();
    for (const f of fileData) {
      const tf0 = performance.now();
      const parsed = parseCode(f.content, f.extension);
      const tf1 = performance.now();
      parseLatenciesPerFile.push(tf1 - tf0);
      if (iter === 0) {
        totalSymbolsExtracted += parsed.symbols.length;
      }
    }
    const t1 = performance.now();
    totalParseDurationMs += (t1 - t0);
  }

  const avgParseDurationMs = totalParseDurationMs / ITERATIONS;
  const parseThroughputFilesSec = (files.length / (avgParseDurationMs / 1000));
  const parseThroughputLinesSec = (totalLines / (avgParseDurationMs / 1000));
  const parseThroughputKbSec = ((totalBytes / 1024) / (avgParseDurationMs / 1000));
  const parseStats = calculateStats(parseLatenciesPerFile);

  console.log(`   - Total Files:          ${files.length}`);
  console.log(`   - Total Lines:          ${totalLines} LOC`);
  console.log(`   - Total Source Bytes:   ${(totalBytes / 1024).toFixed(1)} KB`);
  console.log(`   - Total Symbols Found:  ${totalSymbolsExtracted}`);
  console.log(`   - Iterations:           ${ITERATIONS}`);
  console.log(`   - Mean Batch Latency:   ${avgParseDurationMs.toFixed(2)} ms`);
  console.log(`   - Parsing Throughput:   ${parseThroughputLinesSec.toFixed(0)} lines/sec (${parseThroughputFilesSec.toFixed(1)} files/sec, ${parseThroughputKbSec.toFixed(1)} KB/sec)`);
  console.log(`   - Per-File Latency:     P50 = ${parseStats.p50Ms} ms | P90 = ${parseStats.p90Ms} ms | P95 = ${parseStats.p95Ms} ms | Max = ${parseStats.maxMs} ms\n`);

  // 3. Dependency Graph Construction & Import Resolution (10 iterations)
  console.log(`🕸️ [Benchmark 3: Dependency Graph Construction & Import Resolution]`);
  const analyzedFilesBaseline = fileData.map((f) => {
    const parsed = parseCode(f.content, f.extension);
    const resolvedImports = resolveImports(
      { path: f.path, language: f.language, extension: f.extension },
      parsed.imports,
      files
    );
    return {
      path: f.path,
      language: f.language,
      extension: f.extension,
      symbols: parsed.symbols,
      imports: parsed.imports,
      resolvedImports,
      dependencies: resolvedImports
        .map((r) => r.resolvedPath)
        .filter((p): p is string => p !== null),
    };
  });

  const graphLatencies: number[] = [];
  let graphNodesCount = 0;
  let graphEdgesCount = 0;

  for (let i = 0; i < 10; i++) {
    const tg0 = performance.now();
    const g = buildDependencyGraph(analyzedFilesBaseline);
    const tg1 = performance.now();
    graphLatencies.push(tg1 - tg0);
    graphNodesCount = g.nodes.length;
    graphEdgesCount = g.edges.length;
  }

  const graphStats = calculateStats(graphLatencies);
  console.log(`   - Graph Nodes:          ${graphNodesCount}`);
  console.log(`   - Directed Edges:       ${graphEdgesCount}`);
  console.log(`   - Graph Density:        ${(graphEdgesCount / Math.max(1, graphNodesCount)).toFixed(2)} edges/node`);
  console.log(`   - Construction Latency: P50 = ${graphStats.p50Ms} ms | Mean = ${graphStats.meanMs} ms | P95 = ${graphStats.p95Ms} ms\n`);

  // 4. Reverse BFS Change-Impact Traversal Benchmark
  console.log(`🎯 [Benchmark 4: BFS Change-Impact Traversal Performance]`);
  const activeGraph = buildDependencyGraph(analyzedFilesBaseline);
  const impactLatencies: number[] = [];
  const sampleTargets = [
    'services/api/src/services/codeParser.ts',
    'services/api/src/services/workspaceResolver.ts',
    'services/api/src/services/dependencyGraph.ts',
    'apps/web/src/api.ts',
  ];

  let sampleResults: Array<{ file: string; impacted: number; direct: number; timeMs: number }> = [];

  for (const target of sampleTargets) {
    if (activeGraph.nodes.some((n) => n.path === target)) {
      const ti0 = performance.now();
      const res = analyzeChangeImpact(activeGraph, target);
      const ti1 = performance.now();
      const elapsed = ti1 - ti0;
      impactLatencies.push(elapsed);
      if (res.success) {
        sampleResults.push({
          file: target,
          impacted: res.report.totalImpactedFiles,
          direct: res.report.directDependents,
          timeMs: Number(elapsed.toFixed(3)),
        });
      }
    }
  }

  const impactStats = calculateStats(impactLatencies);
  for (const sr of sampleResults) {
    console.log(`   - Target: ${sr.file}`);
    console.log(`     ↳ Impacted Files: ${sr.impacted} (${sr.direct} direct) in ${sr.timeMs} ms`);
  }
  console.log(`   - BFS Traversal Latency: P50 = ${impactStats.p50Ms} ms | Mean = ${impactStats.meanMs} ms | P95 = ${impactStats.p95Ms} ms\n`);

  // 5. Code Search & AST Symbol Query Latency
  console.log(`🔎 [Benchmark 5: Code Search & Symbol Matching Latency]`);
  const searchQueries = ['scanRepository', 'parseCode', 'analyzeChangeImpact', 'App', 'Repository'];
  const searchLatencies: number[] = [];

  for (const q of searchQueries) {
    const ts0 = performance.now();
    let matchCount = 0;
    const queryLower = q.toLowerCase();
    for (const f of analyzedFilesBaseline) {
      for (const s of f.symbols) {
        if (s.name.toLowerCase().includes(queryLower)) {
          matchCount++;
        }
      }
    }
    const ts1 = performance.now();
    searchLatencies.push(ts1 - ts0);
  }
  const searchStats = calculateStats(searchLatencies);
  console.log(`   - Queries Evaluated:    ${searchQueries.join(', ')}`);
  console.log(`   - Symbol Search Latency:P50 = ${searchStats.p50Ms} ms | Mean = ${searchStats.meanMs} ms | P95 = ${searchStats.p95Ms} ms\n`);

  // 6. Memory and Heap Consumption
  const memFinal = process.memoryUsage();
  console.log(`💾 [Benchmark 6: Memory & Process Footprint]`);
  console.log(`   - Initial Heap Used:    ${(memInitial.heapUsed / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   - Peak / Current Heap:  ${(memFinal.heapUsed / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   - Delta Heap Used:      ${((memFinal.heapUsed - memInitial.heapUsed) / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   - Process RSS:          ${(memFinal.rss / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   - External C++ Buffers: ${(memFinal.external / (1024 * 1024)).toFixed(2)} MB\n`);

  console.log('================================================================');
  console.log('✅ BENCHMARK SUITE COMPLETE - ALL METRICS RECORDED DETERMINISTICALLY');
  console.log('================================================================\n');
}

runBenchmark().catch((err) => {
  console.error('Benchmark execution failed:', err);
  process.exit(1);
});
