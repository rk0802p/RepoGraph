import { Router, Request, Response } from 'express';
import type { GraphNeighborhood, CodeSymbol, GraphEdge, SymbolKind } from '@repograph/shared-types';
import { resolveRepository } from '../services/workspaceResolver.js';
import { analyzeRepository } from '../services/repositoryAnalyzer.js';
import { buildDependencyGraph } from '../services/dependencyGraph.js';

export const graphRouter = Router();

function mapSymbolKind(kind: string): SymbolKind {
  switch (kind) {
    case 'function':
      return 'function';
    case 'class':
      return 'class';
    case 'interface':
      return 'interface';
    case 'type':
      return 'type_alias';
    case 'variable':
      return 'variable';
    default:
      return 'function';
  }
}

function isTestPath(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/').toLowerCase();
  return (
    norm.includes('.test.') ||
    norm.includes('.spec.') ||
    norm.includes('/tests/') ||
    norm.includes('/__tests__/')
  );
}

// GET /api/repositories/:id/graph
graphRouter.get('/:id/graph', async (req: Request, res: Response) => {
  try {
    const rawRepoId = req.params.id as string;
    const resolved = await resolveRepository(rawRepoId === 'repo-sample-01' ? 'RepoGraph' : rawRepoId);

    if ('error' in resolved) {
      res.status(resolved.status).json({ error: resolved.error });
      return;
    }

    const requestedSymbolId = (req.query.symbolId as string) || '';
    const depth = Math.max(1, Math.min(5, Number(req.query.depth) || 2));

    // Analyze repository with real Tree-sitter parser
    const analysis = await analyzeRepository(resolved.rootDirectory, resolved.repository);
    const depGraph = buildDependencyGraph(analysis.files);

    const allSymbols: CodeSymbol[] = [];
    const allEdges: GraphEdge[] = [];

    // Map analyzed files and AST symbols to CodeSymbol models
    for (const file of analysis.files) {
      const isTest = isTestPath(file.path);
      const fileSymbolId = `file:${file.path}`;

      allSymbols.push({
        id: fileSymbolId,
        fileId: file.path,
        revisionId: 'HEAD',
        name: file.path.split('/').pop() || file.path,
        qualifiedName: file.path,
        kind: isTest ? 'test_suite' : 'class',
        span: { startLine: 1, startColumn: 0, endLine: 100, endColumn: 0 },
        isExported: true,
      });

      for (const sym of file.symbols) {
        const symId = `sym:${file.path}:${sym.name}`;
        allSymbols.push({
          id: symId,
          fileId: file.path,
          revisionId: 'HEAD',
          name: sym.name,
          qualifiedName: `${file.path}::${sym.name}`,
          kind: mapSymbolKind(sym.kind),
          span: {
            startLine: sym.startLine,
            startColumn: 0,
            endLine: sym.endLine,
            endColumn: 0,
          },
          signature: `${sym.kind} ${sym.name}`,
          isExported: true,
          parentSymbolId: fileSymbolId,
        });

        // Edge between file and its declared symbol
        allEdges.push({
          id: `edge:def:${fileSymbolId}:${symId}`,
          revisionId: 'HEAD',
          sourceId: fileSymbolId,
          targetId: symId,
          relationType: 'DEFINES',
          resolutionMethod: 'ast_syntax',
          confidence: 'observed',
        });
      }
    }

    // Map resolved imports to GraphEdges
    for (const edge of depGraph.edges) {
      const isTest = isTestPath(edge.source);
      allEdges.push({
        id: `edge:${edge.source}:${edge.target}:${edge.startLine}`,
        revisionId: 'HEAD',
        sourceId: `file:${edge.source}`,
        targetId: `file:${edge.target}`,
        relationType: isTest ? 'TESTS' : 'IMPORTS',
        resolutionMethod: 'import_table',
        confidence: 'observed',
        sourceSpan: {
          startLine: edge.startLine,
          startColumn: 0,
          endLine: edge.startLine,
          endColumn: 0,
        },
        rationale: `Imported via "${edge.importSource}" at line ${edge.startLine}`,
      });
    }

    // Determine root node for neighborhood extraction
    const rootSymbol =
      allSymbols.find((s) => s.id === requestedSymbolId || s.name === requestedSymbolId) ||
      allSymbols[0];

    if (!rootSymbol) {
      res.status(200).json({
        rootSymbolId: '',
        depth,
        nodes: [],
        edges: [],
        metadata: { truncated: false, totalConnected: 0 },
      });
      return;
    }

    // Perform BFS bounded traversal
    const includedNodeIds = new Set<string>([rootSymbol.id]);
    let currentFrontier = [rootSymbol.id];

    for (let d = 0; d < depth; d++) {
      const nextFrontier: string[] = [];
      for (const nodeId of currentFrontier) {
        for (const edge of allEdges) {
          if (edge.sourceId === nodeId && !includedNodeIds.has(edge.targetId)) {
            includedNodeIds.add(edge.targetId);
            nextFrontier.push(edge.targetId);
          } else if (edge.targetId === nodeId && !includedNodeIds.has(edge.sourceId)) {
            includedNodeIds.add(edge.sourceId);
            nextFrontier.push(edge.sourceId);
          }
        }
      }
      currentFrontier = nextFrontier;
      if (currentFrontier.length === 0) break;
    }

    const neighborhoodNodes = allSymbols.filter((s) => includedNodeIds.has(s.id));
    const neighborhoodEdges = allEdges.filter(
      (e) => includedNodeIds.has(e.sourceId) && includedNodeIds.has(e.targetId)
    );

    const neighborhood: GraphNeighborhood = {
      rootSymbolId: rootSymbol.id,
      depth,
      nodes: neighborhoodNodes,
      edges: neighborhoodEdges,
      metadata: {
        truncated: neighborhoodNodes.length < allSymbols.length,
        totalConnected: neighborhoodNodes.length,
      },
    };

    res.status(200).json(neighborhood);
  } catch (error) {
    console.error('Failed to construct graph neighborhood:', error);
    res.status(500).json({ error: 'Failed to retrieve graph neighborhood' });
  }
});
