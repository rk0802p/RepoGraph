import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCode } from '../src/services/codeParser.js';
import { buildDependencyGraph } from '../src/services/dependencyGraph.js';
import { analyzeChangeImpact } from '../src/services/impactAnalyzer.js';
import type { AnalyzedFile } from '../src/services/repositoryAnalyzer.js';

function makeMockAnalyzedFile(path: string, deps: string[] = []): AnalyzedFile {
  return {
    path,
    language: 'TypeScript',
    extension: '.ts',
    symbols: [],
    imports: deps.map((d, i) => ({ source: `./${d}`, startLine: i + 1 })),
    resolvedImports: deps.map((d, i) => ({ source: `./${d}`, startLine: i + 1, resolvedPath: d })),
    dependencies: deps,
  };
}

// ---------------------------------------------------------------------------
// AST Parser Edge Cases
// ---------------------------------------------------------------------------
test('parseCode handles empty source code string gracefully', () => {
  const result = parseCode('', '.ts');
  assert.equal(result.symbols.length, 0);
  assert.equal(result.imports.length, 0);
});

test('parseCode recovers from syntax errors in malformed code', () => {
  const malformedSource = `
    function validBefore() { return true; }
    class Broken { invalid @@@@ syntax }}}
    function validAfter() { return false; }
  `;
  const result = parseCode(malformedSource, '.ts');
  assert.ok(result.symbols.some((s) => s.name === 'validBefore'));
  assert.ok(result.symbols.some((s) => s.name === 'validAfter'));
});

test('parseCode extracts unicode identifiers', () => {
  const unicodeSource = `
    const résumé = (données: string) => données;
    function calculateπ() { return 3.14159; }
  `;
  const result = parseCode(unicodeSource, '.ts');
  assert.ok(result.symbols.some((s) => s.name === 'résumé'));
  assert.ok(result.symbols.some((s) => s.name === 'calculateπ'));
});

// ---------------------------------------------------------------------------
// Graph & BFS Traversal Edge Cases: Cycles, Multiple Paths, Disconnected Nodes
// ---------------------------------------------------------------------------
test('analyzeChangeImpact terminates safely in cyclic dependency graphs without infinite loops', () => {
  // Cycle: A -> B -> C -> A
  // If C changes, B depends on C, and A depends on B.
  const files: AnalyzedFile[] = [
    makeMockAnalyzedFile('src/A.ts', ['src/B.ts']),
    makeMockAnalyzedFile('src/B.ts', ['src/C.ts']),
    makeMockAnalyzedFile('src/C.ts', ['src/A.ts']),
  ];

  const graph = buildDependencyGraph(files);
  const result = analyzeChangeImpact(graph, 'src/C.ts');

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.report.totalImpactedFiles, 2);
    assert.equal(result.report.directDependents, 1); // B is direct consumer of C
    assert.equal(result.report.transitiveDependents, 1); // A is transitive consumer via B
    assert.ok(result.report.impactedFiles.some((f) => f.path === 'src/B.ts' && f.distance === 1));
    assert.ok(result.report.impactedFiles.some((f) => f.path === 'src/A.ts' && f.distance === 2));
  }
});

test('analyzeChangeImpact handles multiple paths to the same dependent and records the shortest distance', () => {
  // Graph:
  // Direct: App.ts -> Core.ts (distance 1)
  // Transitive: App.ts -> Service.ts -> Core.ts (distance 2)
  // When Core.ts changes, App.ts should be detected as direct dependent (distance 1).
  const files: AnalyzedFile[] = [
    makeMockAnalyzedFile('src/Core.ts', []),
    makeMockAnalyzedFile('src/Service.ts', ['src/Core.ts']),
    makeMockAnalyzedFile('src/App.ts', ['src/Core.ts', 'src/Service.ts']),
  ];

  const graph = buildDependencyGraph(files);
  const result = analyzeChangeImpact(graph, 'src/Core.ts');

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.report.totalImpactedFiles, 2);
    const appEntry = result.report.impactedFiles.find((f) => f.path === 'src/App.ts');
    assert.ok(appEntry);
    assert.equal(appEntry?.distance, 1);
    assert.equal(appEntry?.relationship, 'direct');
  }
});

test('analyzeChangeImpact on leaf node with no consumers returns 0 impacted files', () => {
  // App.ts -> Util.ts; App.ts is not consumed by anything.
  const files: AnalyzedFile[] = [
    makeMockAnalyzedFile('src/Util.ts', []),
    makeMockAnalyzedFile('src/App.ts', ['src/Util.ts']),
  ];

  const graph = buildDependencyGraph(files);
  const result = analyzeChangeImpact(graph, 'src/App.ts');

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.report.totalImpactedFiles, 0);
    assert.equal(result.report.directDependents, 0);
    assert.equal(result.report.transitiveDependents, 0);
  }
});

test('analyzeChangeImpact isolates disconnected subgraphs', () => {
  // Subgraph 1: A -> B
  // Subgraph 2: X -> Y
  const files: AnalyzedFile[] = [
    makeMockAnalyzedFile('src/A.ts', ['src/B.ts']),
    makeMockAnalyzedFile('src/B.ts', []),
    makeMockAnalyzedFile('src/X.ts', ['src/Y.ts']),
    makeMockAnalyzedFile('src/Y.ts', []),
  ];

  const graph = buildDependencyGraph(files);
  const result = analyzeChangeImpact(graph, 'src/B.ts');

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.report.totalImpactedFiles, 1);
    assert.equal(result.report.impactedFiles[0]?.path, 'src/A.ts');
    assert.ok(!result.report.impactedFiles.some((f) => f.path === 'src/X.ts' || f.path === 'src/Y.ts'));
  }
});
