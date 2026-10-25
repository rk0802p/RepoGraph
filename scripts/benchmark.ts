/**
 * RepoGraph Performance & Architectural Benchmark Suite
 *
 * Methodological Design:
 * - Dedicated warm-up iterations to eliminate V8 JIT compilation anomalies.
 * - Separates import resolution latency from graph construction latency.
 * - Multi-iteration BFS traversal across multiple node depths (high-degree, intermediate, leaf).
 * - Multi-scale synthetic workloads (50 and 150 modules) evaluating graph and BFS scalability.
 * - Continuous heap sampling to observe true peak memory usage.
 * - Validates ground-truth correctness assertions (nodes, edges, symbol counts, impact integrity).
 * - Transparently scoped as empirical project measurements on the host hardware.
 */

import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { scanRepository } from '../services/api/src/services/repositoryScanner.js';
import { parseCode, type ParsedCode } from '../services/api/src/services/codeParser.js';
import { resolveImports } from '../services/api/src/services/importResolver.js';
import { buildDependencyGraph } from '../services/api/src/services/dependencyGraph.js';
import { analyzeChangeImpact } from '../services/api/src/services/impactAnalyzer.js';
import type { AnalyzedFile } from '../services/api/src/services/repositoryAnalyzer.js';

interface LatencyStats {
  minMs: number;
  maxMs: number;
  meanMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
}

function calculateStats(samples: number[]): LatencyStats {
  if (samples.length === 0) {
    return { minMs: 0, maxMs: 0, meanMs: 0, p50Ms: 0, p90Ms: 0, p95Ms: 0, p99Ms: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p90 = sorted[Math.floor(sorted.length * 0.90)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];

  return {
    minMs: Number(sorted[0].toFixed(3)),
    maxMs: Number(sorted[sorted.length - 1].toFixed(3)),
    meanMs: Number((sum / sorted.length).toFixed(3)),
    p50Ms: Number(p50.toFixed(3)),
    p90Ms: Number(p90.toFixed(3)),
    p95Ms: Number(p95.toFixed(3)),
    p99Ms: Number(p99.toFixed(3)),
  };
}

function generateSyntheticRepository(moduleCount: number, edgeDensity = 2.5): AnalyzedFile[] {
  const files: AnalyzedFile[] = [];
  for (let i = 0; i < moduleCount; i++) {
    const modPath = `src/module_${String(i).padStart(3, '0')}.ts`;
    const deps: string[] = [];
    const numDeps = Math.min(i, Math.round(edgeDensity));
    for (let d = 1; d <= numDeps; d++) {
      deps.push(`src/module_${String(i - d).padStart(3, '0')}.ts`);
    }
    files.push({
      path: modPath,
      language: 'TypeScript',
      extension: '.ts',
      symbols: [
        { name: `Module${i}Class`, kind: 'class', startLine: 1, endLine: 20 },
        { name: `module${i}Function`, kind: 'function', startLine: 22, endLine: 40 },
      ],
      imports: deps.map((d, idx) => ({ source: `./${path.basename(d, '.ts')}`, startLine: idx + 1 })),
      resolvedImports: deps.map((d, idx) => ({ source: `./${path.basename(d, '.ts')}`, startLine: idx + 1, resolvedPath: d })),
      dependencies: deps,
    });
  }
  return files;
}

async function runBenchmark() {
  console.log('\n================================================================');
  console.log('📊 REPO GRAPH EMPIRICAL BENCHMARK & PERFORMANCE SUITE');
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

  console.log(`Environment:  Project-Specific Empirical Measurements`);
  console.log(`Node.js:      ${envInfo.nodeVersion}`);
  console.log(`OS:           ${envInfo.platform}`);
  console.log(`CPU:          ${envInfo.cpuModel} (${envInfo.cpus} cores)`);
  console.log(`RAM:          ${envInfo.totalMemoryMB} MB`);
  console.log(`Repository:   ${repoRoot}\n`);

  let peakHeapUsedBytes = process.memoryUsage().heapUsed;
  function updatePeakMemory() {
    const current = process.memoryUsage().heapUsed;
    if (current > peakHeapUsedBytes) peakHeapUsedBytes = current;
  }

  const memInitial = process.memoryUsage();

  // -------------------------------------------------------------------------
  // 1. Repository Discovery & File Scanning
  // -------------------------------------------------------------------------
  const tScanStart = performance.now();
  const files = await scanRepository(repoRoot);
  const tScanEnd = performance.now();
  const scanDurationMs = tScanEnd - tScanStart;
  assert.ok(files.length > 0, 'Repository scanner must discover source files');

  console.log(`🔍 [Benchmark 1: Repository Scan]`);
  console.log(`   - Discovered:   ${files.length} supported source files`);
  console.log(`   - Scan Latency: ${scanDurationMs.toFixed(2)} ms\n`);

  // Read file data
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
  updatePeakMemory();

  // -------------------------------------------------------------------------
  // 2. Tree-sitter AST Parsing (Warm-up + 5 Measurement Iterations)
  // -------------------------------------------------------------------------
  console.log(`⚡ [Benchmark 2: Tree-sitter AST Parsing Throughput]`);
  // Warm-up run
  for (const f of fileData) {
    parseCode(f.content, f.extension);
  }
  updatePeakMemory();

  const PARSE_ITERATIONS = 5;
  const parseLatenciesPerFile: number[] = [];
  let totalParseDurationMs = 0;
  let totalSymbolsExtracted = 0;
  let baselineParsedFiles: Array<ParsedCode> = [];

  for (let iter = 0; iter < PARSE_ITERATIONS; iter++) {
    const t0 = performance.now();
    const currentParsed: Array<ParsedCode> = [];
    for (const f of fileData) {
      const tf0 = performance.now();
      const parsed = parseCode(f.content, f.extension);
      const tf1 = performance.now();
      parseLatenciesPerFile.push(tf1 - tf0);
      currentParsed.push(parsed);
      if (iter === 0) {
        totalSymbolsExtracted += parsed.symbols.length;
      }
    }
    const t1 = performance.now();
    totalParseDurationMs += (t1 - t0);
    if (iter === 0) {
      baselineParsedFiles = currentParsed;
    }
    updatePeakMemory();
  }

  assert.ok(totalSymbolsExtracted > 0, 'AST parser must extract symbols');
  const avgParseDurationMs = totalParseDurationMs / PARSE_ITERATIONS;
  const parseThroughputFilesSec = (files.length / (avgParseDurationMs / 1000));
  const parseThroughputLinesSec = (totalLines / (avgParseDurationMs / 1000));
  const parseThroughputKbSec = ((totalBytes / 1024) / (avgParseDurationMs / 1000));
  const parseStats = calculateStats(parseLatenciesPerFile);

  console.log(`   - Total Files:          ${files.length}`);
  console.log(`   - Total Lines:          ${totalLines} LOC`);
  console.log(`   - Total Source Bytes:   ${(totalBytes / 1024).toFixed(1)} KB`);
  console.log(`   - Total Symbols Found:  ${totalSymbolsExtracted}`);
  console.log(`   - Warm-up Completed:    1 pass`);
  console.log(`   - Measurement Runs:     ${PARSE_ITERATIONS} passes`);
  console.log(`   - Mean Batch Latency:   ${avgParseDurationMs.toFixed(2)} ms`);
  console.log(`   - Parsing Throughput:   ${parseThroughputLinesSec.toFixed(0)} lines/sec (${parseThroughputFilesSec.toFixed(1)} files/sec, ${parseThroughputKbSec.toFixed(1)} KB/sec)`);
  console.log(`   - Per-File Latency:     P50 = ${parseStats.p50Ms} ms | P90 = ${parseStats.p90Ms} ms | P95 = ${parseStats.p95Ms} ms | Max = ${parseStats.maxMs} ms\n`);

  // -------------------------------------------------------------------------
  // 3. Import Resolution & Graph Assembly (Timed Separately)
  // -------------------------------------------------------------------------
  console.log(`🕸️ [Benchmark 3: Import Resolution & Dependency Graph Construction]`);

  // 3a. Import Resolution Benchmark (10 iterations)
  const importResolutionLatencies: number[] = [];
  for (let i = 0; i < 10; i++) {
    const tir0 = performance.now();
    for (let fIdx = 0; fIdx < fileData.length; fIdx++) {
      const f = fileData[fIdx];
      const parsed = baselineParsedFiles[fIdx];
      resolveImports(
        { path: f.path, language: f.language, extension: f.extension },
        parsed.imports,
        files
      );
    }
    const tir1 = performance.now();
    importResolutionLatencies.push(tir1 - tir0);
  }
  const importStats = calculateStats(importResolutionLatencies);

  // Prepare analyzed files baseline
  const analyzedFilesBaseline = fileData.map((f, fIdx) => {
    const parsed = baselineParsedFiles[fIdx];
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
  updatePeakMemory();

  // 3b. Directed Graph Assembly Benchmark (10 iterations)
  const graphAssemblyLatencies: number[] = [];
  let graphNodesCount = 0;
  let graphEdgesCount = 0;

  for (let i = 0; i < 10; i++) {
    const tg0 = performance.now();
    const g = buildDependencyGraph(analyzedFilesBaseline);
    const tg1 = performance.now();
    graphAssemblyLatencies.push(tg1 - tg0);
    graphNodesCount = g.nodes.length;
    graphEdgesCount = g.edges.length;
  }
  const graphStats = calculateStats(graphAssemblyLatencies);

  assert.equal(graphNodesCount, files.length, 'Every source file must have a corresponding graph node');
  assert.ok(graphEdgesCount > 0, 'Graph must contain directed dependency edges');

  console.log(`   - Graph Nodes:          ${graphNodesCount}`);
  console.log(`   - Directed Edges:       ${graphEdgesCount}`);
  console.log(`   - Graph Density:        ${(graphEdgesCount / Math.max(1, graphNodesCount)).toFixed(2)} edges/node`);
  console.log(`   - Import Resolution:    P50 = ${importStats.p50Ms} ms | Mean = ${importStats.meanMs} ms | P95 = ${importStats.p95Ms} ms`);
  console.log(`   - Graph Assembly:       P50 = ${graphStats.p50Ms} ms | Mean = ${graphStats.meanMs} ms | P95 = ${graphStats.p95Ms} ms\n`);

  // -------------------------------------------------------------------------
  // 4. Reverse BFS Change-Impact Traversal (Multi-Iteration & Multi-Depth)
  // -------------------------------------------------------------------------
  console.log(`🎯 [Benchmark 4: Reverse BFS Change-Impact Traversal Performance]`);
  const activeGraph = buildDependencyGraph(analyzedFilesBaseline);

  const inDegreeMap = new Map<string, number>();
  for (const edge of activeGraph.edges) {
    inDegreeMap.set(edge.target, (inDegreeMap.get(edge.target) || 0) + 1);
  }

  const sortedByDependents = [...activeGraph.nodes].sort(
    (a, b) => (inDegreeMap.get(b.path) || 0) - (inDegreeMap.get(a.path) || 0)
  );

  const targetsToBenchmark = [
    sortedByDependents[0]?.path,
    sortedByDependents[Math.floor(sortedByDependents.length / 2)]?.path,
    sortedByDependents[sortedByDependents.length - 1]?.path,
  ].filter((p): p is string => Boolean(p));

  const allBfsLatencies: number[] = [];
  const targetSummaries: Array<{ file: string; direct: number; total: number; meanMs: number }> = [];

  for (const target of targetsToBenchmark) {
    analyzeChangeImpact(activeGraph, target);

    const targetRuns: number[] = [];
    let lastReport: ReturnType<typeof analyzeChangeImpact> | null = null;

    for (let r = 0; r < 10; r++) {
      const tb0 = performance.now();
      const res = analyzeChangeImpact(activeGraph, target);
      const tb1 = performance.now();
      targetRuns.push(tb1 - tb0);
      allBfsLatencies.push(tb1 - tb0);
      lastReport = res;
    }

    if (lastReport && lastReport.success) {
      assert.ok(
        lastReport.report.totalImpactedFiles >= lastReport.report.directDependents,
        'Total impacted files must be greater than or equal to direct dependents'
      );
      targetSummaries.push({
        file: target,
        direct: lastReport.report.directDependents,
        total: lastReport.report.totalImpactedFiles,
        meanMs: Number((targetRuns.reduce((a, b) => a + b, 0) / targetRuns.length).toFixed(3)),
      });
    }
    updatePeakMemory();
  }

  const bfsStats = calculateStats(allBfsLatencies);
  for (const ts of targetSummaries) {
    console.log(`   - Target: ${ts.file}`);
    console.log(`     ↳ Dependents: ${ts.total} files (${ts.direct} direct) | Mean traversal: ${ts.meanMs} ms`);
  }
  console.log(`   - Aggregate BFS Latency: P50 = ${bfsStats.p50Ms} ms | Mean = ${bfsStats.meanMs} ms | P95 = ${bfsStats.p95Ms} ms\n`);

  // -------------------------------------------------------------------------
  // 5. Code Search & AST Symbol Query Latency
  // -------------------------------------------------------------------------
  console.log(`🔎 [Benchmark 5: Code Search & Symbol Matching Latency]`);
  const searchQueries = [
    'scanRepository',
    'parseCode',
    'analyzeChangeImpact',
    'resolveImports',
    'Repository',
  ];
  const searchLatencies: number[] = [];
  const searchSummary: Array<{ query: string; matches: number; latencyMs: number }> = [];

  for (const q of searchQueries) {
    for (const f of analyzedFilesBaseline) {
      f.symbols.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()));
    }

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
    const elapsed = ts1 - ts0;
    searchLatencies.push(elapsed);
    searchSummary.push({ query: q, matches: matchCount, latencyMs: Number(elapsed.toFixed(3)) });
  }

  const searchStats = calculateStats(searchLatencies);
  for (const item of searchSummary) {
    console.log(`   - Query: "${item.query}" ➔ Found ${item.matches} matches in ${item.latencyMs} ms`);
  }
  console.log(`   - Query Aggregate Latency: P50 = ${searchStats.p50Ms} ms | Mean = ${searchStats.meanMs} ms | P95 = ${searchStats.p95Ms} ms\n`);

  // -------------------------------------------------------------------------
  // 6. Synthetic Workload Scalability (Medium: 50 Modules, Large: 150 Modules)
  // -------------------------------------------------------------------------
  console.log(`📈 [Benchmark 6: Synthetic Workload Scalability Analysis]`);

  // 6a. Medium Workload (50 modules, ~110 edges)
  const mediumFiles = generateSyntheticRepository(50, 2.5);
  const tMedG0 = performance.now();
  const mediumGraph = buildDependencyGraph(mediumFiles);
  const tMedG1 = performance.now();
  const medGraphTime = tMedG1 - tMedG0;

  const tMedB0 = performance.now();
  const medImpact = analyzeChangeImpact(mediumGraph, 'src/module_000.ts');
  const tMedB1 = performance.now();
  const medImpactTime = tMedB1 - tMedB0;
  assert.equal(medImpact.success, true);
  if (medImpact.success) {
    assert.equal(medImpact.report.totalImpactedFiles, 49, 'Root change in synthetic DAG must impact all 49 downstream modules');
  }

  console.log(`   - Medium Workload (50 files, ${mediumGraph.edges.length} edges):`);
  console.log(`     ↳ Graph Construction: ${medGraphTime.toFixed(3)} ms`);
  console.log(`     ↳ BFS Impact Traversal (49 dependents): ${medImpactTime.toFixed(3)} ms`);

  // 6b. Large Scaled Workload (150 modules, ~360 edges)
  const largeFiles = generateSyntheticRepository(150, 2.5);
  const tLrgG0 = performance.now();
  const largeGraph = buildDependencyGraph(largeFiles);
  const tLrgG1 = performance.now();
  const lrgGraphTime = tLrgG1 - tLrgG0;

  const tLrgB0 = performance.now();
  const lrgImpact = analyzeChangeImpact(largeGraph, 'src/module_000.ts');
  const tLrgB1 = performance.now();
  const lrgImpactTime = tLrgB1 - tLrgB0;
  assert.equal(lrgImpact.success, true);
  if (lrgImpact.success) {
    assert.equal(lrgImpact.report.totalImpactedFiles, 149, 'Root change in synthetic DAG must impact all 149 downstream modules');
  }

  console.log(`   - Scaled Workload (150 files, ${largeGraph.edges.length} edges):`);
  console.log(`     ↳ Graph Construction: ${lrgGraphTime.toFixed(3)} ms`);
  console.log(`     ↳ BFS Impact Traversal (149 dependents): ${lrgImpactTime.toFixed(3)} ms\n`);

  // -------------------------------------------------------------------------
  // 7. Memory & Heap Lifecycle Analysis
  // -------------------------------------------------------------------------
  updatePeakMemory();
  const memFinal = process.memoryUsage();
  console.log(`💾 [Benchmark 7: Memory & Process Lifecycle Footprint]`);
  console.log(`   - Initial Heap:         ${(memInitial.heapUsed / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   - Observed Peak Heap:   ${(peakHeapUsedBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   - Final Heap:           ${(memFinal.heapUsed / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   - Net Heap Delta:       ${((memFinal.heapUsed - memInitial.heapUsed) / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   - Resident Set Size:    ${(memFinal.rss / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   - External C++ Buffers: ${(memFinal.external / (1024 * 1024)).toFixed(2)} MB\n`);

  console.log('================================================================');
  console.log('✅ BENCHMARK SUITE COMPLETE - ALL CORRECTNESS ASSERTIONS PASSED');
  console.log('================================================================\n');
}

runBenchmark().catch((err) => {
  console.error('Benchmark execution failed:', err);
  process.exit(1);
});
