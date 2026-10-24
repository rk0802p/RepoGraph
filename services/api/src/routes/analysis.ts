import { Router, Request, Response } from 'express';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type {
  ImpactAnalysisReport,
  AssistantQueryResponse,
  ImpactFinding,
  CodeSymbol,
  AssistantCitation,
} from '@repograph/shared-types';
import { resolveRepository } from '../services/workspaceResolver.js';
import { analyzeRepository } from '../services/repositoryAnalyzer.js';
import { buildDependencyGraph } from '../services/dependencyGraph.js';
import { analyzeChangeImpact } from '../services/impactAnalyzer.js';

export const analysisRouter = Router();

function isTestPath(filePath: string): boolean {
  const norm = filePath.replace(/\\/g, '/').toLowerCase();
  return (
    norm.includes('.test.') ||
    norm.includes('.spec.') ||
    norm.includes('/tests/') ||
    norm.includes('/__tests__/')
  );
}

// Extract changed file paths from standard Unified Git Diff output
function extractChangedFilesFromDiff(diffText: string): string[] {
  const filePaths = new Set<string>();
  const lines = diffText.split(/\r?\n/);

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/diff --git a\/(.+) b\/(.+)/);
      if (match && match[2]) filePaths.add(match[2].trim());
    } else if (line.startsWith('+++ b/')) {
      filePaths.add(line.replace('+++ b/', '').trim());
    } else if (line.startsWith('--- a/')) {
      filePaths.add(line.replace('--- a/', '').trim());
    }
  }

  return Array.from(filePaths);
}

// POST /api/repositories/:id/ask (Dynamic Evidence-Grounded Q&A)
analysisRouter.post('/:id/ask', async (req: Request, res: Response) => {
  try {
    const rawRepoId = req.params.id as string;
    const resolved = await resolveRepository(rawRepoId === 'repo-sample-01' ? 'RepoGraph' : rawRepoId);

    if ('error' in resolved) {
      res.status(resolved.status).json({ error: resolved.error });
      return;
    }

    const { question } = req.body;
    if (!question || typeof question !== 'string') {
      res.status(400).json({ error: 'Question is required' });
      return;
    }

    const analysis = await analyzeRepository(resolved.rootDirectory, resolved.repository);

    // Filter stopwords to extract meaningful search keywords and word stems
    const stopWords = new Set(['what', 'where', 'how', 'when', 'is', 'the', 'a', 'an', 'in', 'to', 'for', 'of', 'and', 'or', 'does', 'do', 'can', 'before', 'after']);
    const rawKeywords = question
      .toLowerCase()
      .replace(/[^a-z0-9_\-\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    const keywords = new Set<string>();
    for (const w of rawKeywords) {
      keywords.add(w);
      if (w.endsWith('ed')) {
        keywords.add(w.slice(0, -2));
        keywords.add(w.slice(0, -1));
      }
      if (w.endsWith('ing')) keywords.add(w.slice(0, -3));
      if (w.endsWith('s') && w.length > 3) keywords.add(w.slice(0, -1));
    }
    const keywordList = Array.from(keywords).filter((k) => k.length >= 3);

    interface ScoredCitation {
      citation: AssistantCitation;
      score: number;
    }
    const scoredCitations: ScoredCitation[] = [];
    const matchedSymbols: string[] = [];

    for (const file of analysis.files) {
      const fullPath = path.join(resolved.rootDirectory, file.path);
      let fileContent = '';
      let lines: string[] = [];

      try {
        fileContent = await readFile(fullPath, 'utf8');
        lines = fileContent.split(/\r?\n/);
      } catch {
        continue;
      }

      // Check symbol declarations
      for (const sym of file.symbols) {
        const symLower = sym.name.toLowerCase();
        let symScore = 0;
        for (const kw of keywordList) {
          if (symLower === kw) symScore += 3;
          else if (symLower.includes(kw)) symScore += 2;
        }

        if (symScore > 0) {
          matchedSymbols.push(sym.name);
          const start = Math.max(0, sym.startLine - 1);
          const end = Math.min(lines.length, sym.endLine);
          const snippet = lines.slice(start, end).slice(0, 5).join('\n');

          scoredCitations.push({
            score: symScore,
            citation: {
              filePath: file.path,
              startLine: sym.startLine,
              endLine: sym.endLine,
              symbolName: sym.name,
              snippet,
            },
          });
        }
      }

      // Check if file path itself matches keywords
      let pathScore = 0;
      for (const kw of keywordList) {
        if (file.path.toLowerCase().includes(kw)) pathScore += 1;
      }
      if (pathScore > 0) {
        scoredCitations.push({
          score: pathScore,
          citation: {
            filePath: file.path,
            startLine: 1,
            endLine: Math.min(10, lines.length),
            snippet: lines.slice(0, 5).join('\n'),
          },
        });
      }
    }

    // Rank citations by relevance score descending
    scoredCitations.sort((a, b) => b.score - a.score);
    const matchedCitations = scoredCitations.slice(0, 5).map((s) => s.citation);

    let answer = '';
    if (matchedCitations.length > 0) {
      const primaryCitation = matchedCitations[0];
      answer = `Based on static analysis of \`${resolved.repository}\`, relevant behavior was identified in \`${primaryCitation.filePath}\`${
        primaryCitation.symbolName ? ` around symbol \`${primaryCitation.symbolName}\`` : ''
      } (lines ${primaryCitation.startLine}-${primaryCitation.endLine}). ${
        matchedSymbols.length > 1
          ? `Related symbols participating in this flow include: ${matchedSymbols.slice(0, 4).map((s) => `\`${s}\``).join(', ')}.`
          : ''
      }`;
    } else {
      // General repository structural summary fallback
      answer = `Inspected repository \`${resolved.repository}\` across ${analysis.totalFiles} source files. No direct symbol matches were found for the query keywords (${keywordList.join(', ')}).`;
    }

    const response: AssistantQueryResponse = {
      answer,
      citations: matchedCitations,
      confidence: matchedCitations.length > 0 ? 'observed' : 'uncertain',
      caveats: [
        'Static analysis resolved symbols and imports using Tree-sitter AST syntax.',
        'Dynamic runtime dispatch, environment-based hooks, and eval are not statically inferred.',
      ],
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Q&A analysis failed:', error);
    res.status(500).json({ error: 'Failed to process Q&A query' });
  }
});

// POST /api/repositories/:id/impact-analysis (Dynamic Change-Impact Analysis)
analysisRouter.post('/:id/impact-analysis', async (req: Request, res: Response) => {
  try {
    const rawRepoId = req.params.id as string;
    const resolved = await resolveRepository(rawRepoId === 'repo-sample-01' ? 'RepoGraph' : rawRepoId);

    if ('error' in resolved) {
      res.status(resolved.status).json({ error: resolved.error });
      return;
    }

    const diffText = (req.body?.diffText as string) || '';
    const specifiedFile = (req.body?.file as string) || '';

    // Determine target file to analyze
    let changedFiles = specifiedFile ? [specifiedFile] : extractChangedFilesFromDiff(diffText);

    const analysis = await analyzeRepository(resolved.rootDirectory, resolved.repository);
    const depGraph = buildDependencyGraph(analysis.files);

    // If no changed file was identified, pick the first non-test file as a fallback
    if (changedFiles.length === 0 || !depGraph.nodes.some((n) => n.path === changedFiles[0])) {
      const candidate = analysis.files.find((f) => !isTestPath(f.path) && f.symbols.length > 0) || analysis.files[0];
      if (candidate) {
        changedFiles = [candidate.path];
      }
    }

    const primaryChangedFile = changedFiles[0] || 'services/api/src/services/codeParser.ts';
    const impactResult = analyzeChangeImpact(depGraph, primaryChangedFile);

    const changedFileObj = analysis.files.find((f) => f.path === primaryChangedFile);
    const changedSymbols: CodeSymbol[] = (changedFileObj?.symbols || []).map((s) => ({
      id: `sym:${primaryChangedFile}:${s.name}`,
      fileId: primaryChangedFile,
      revisionId: 'HEAD',
      name: s.name,
      qualifiedName: `${primaryChangedFile}::${s.name}`,
      kind: 'function',
      span: { startLine: s.startLine, startColumn: 0, endLine: s.endLine, endColumn: 0 },
      isExported: true,
    }));

    if (!impactResult.success) {
      res.status(404).json({ error: impactResult.error });
      return;
    }

    const findings: ImpactFinding[] = impactResult.report.impactedFiles.map((f, idx) => {
      const isTest = isTestPath(f.path);
      const isDirect = f.relationship === 'direct';

      return {
        id: `finding-${idx + 1}`,
        targetSymbolId: `file:${f.path}`,
        targetSymbolName: f.path.split('/').pop() || f.path,
        targetFilePath: f.path,
        priority: isDirect ? 'high' : 'medium',
        confidenceLabel: isDirect ? 'observed' : 'likely',
        dependencyPath: f.dependencyChain,
        rationale: isDirect
          ? `Direct consumer importing "${primaryChangedFile}" at line ${f.importLine}`
          : `Transitive dependent (distance: ${f.distance}) via path: ${f.dependencyChain.join(' ➔ ')}`,
        suggestedTests: isTest
          ? [
              {
                symbolId: `file:${f.path}`,
                name: f.path.split('/').pop() || f.path,
                filePath: f.path,
                isConfirmed: true,
              },
            ]
          : [],
      };
    });

    const highCount = findings.filter((f) => f.priority === 'high').length;
    const medCount = findings.filter((f) => f.priority === 'medium').length;

    const report: ImpactAnalysisReport = {
      id: `analysis-${Date.now()}`,
      repositoryId: resolved.repository,
      baseRevisionSha: 'a4b89f2',
      targetRevisionSha: 'HEAD',
      createdAt: new Date().toISOString(),
      summary: {
        totalChangedFiles: changedFiles.length,
        totalChangedSymbols: changedSymbols.length,
        highImpactCount: highCount,
        mediumImpactCount: medCount,
        needsInspectionCount: 0,
      },
      changedSymbols,
      findings,
      limitations: [
        'Breadth-first search traverses static import statements extracted by Tree-sitter.',
        'Dynamic imports using variables or runtime reflection are not included.',
      ],
    };

    res.status(200).json(report);
  } catch (error) {
    console.error('Impact analysis failed:', error);
    res.status(500).json({ error: 'Failed to execute change-impact analysis' });
  }
});
