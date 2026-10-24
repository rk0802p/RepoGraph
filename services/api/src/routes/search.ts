import { Router, Request, Response } from 'express';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { SearchResponse, SearchResultItem, SearchMode, SymbolKind } from '@repograph/shared-types';
import { resolveRepository } from '../services/workspaceResolver.js';
import { analyzeRepository } from '../services/repositoryAnalyzer.js';

export const searchRouter = Router();

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

// GET /api/repositories/:id/search?q=...&mode=...
searchRouter.get('/:id/search', async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const rawRepoId = req.params.id as string;
    const resolved = await resolveRepository(rawRepoId === 'repo-sample-01' ? 'RepoGraph' : rawRepoId);

    if ('error' in resolved) {
      res.status(resolved.status).json({ error: resolved.error });
      return;
    }

    const query = ((req.query.q as string) || '').trim().toLowerCase();
    const mode = (req.query.mode as SearchMode) || 'hybrid';

    const analysis = await analyzeRepository(resolved.rootDirectory, resolved.repository);
    const results: SearchResultItem[] = [];

    for (const file of analysis.files) {
      const fullPath = path.join(resolved.rootDirectory, file.path);
      let fileContent = '';
      let lines: string[] = [];

      try {
        fileContent = await readFile(fullPath, 'utf8');
        lines = fileContent.split(/\r?\n/);
      } catch {
        // Skip unreadable files
        continue;
      }

      // Check extracted AST symbols
      for (const sym of file.symbols) {
        const symNameLower = sym.name.toLowerCase();
        let matchScore = 0;
        let matchReason = '';

        if (!query) {
          matchScore = 0.5;
          matchReason = 'Symbol declaration';
        } else if (symNameLower === query) {
          matchScore = 1.0;
          matchReason = `Exact identifier match for "${sym.name}"`;
        } else if (symNameLower.includes(query)) {
          matchScore = 0.85;
          matchReason = `Symbol name contains "${query}"`;
        }

        if (matchScore > 0) {
          const start = Math.max(0, sym.startLine - 1);
          const end = Math.min(lines.length, sym.endLine);
          const snippet = lines.slice(start, end).join('\n');

          results.push({
            symbolId: `sym:${file.path}:${sym.name}`,
            fileId: file.path,
            filePath: file.path,
            symbolName: sym.name,
            symbolKind: mapSymbolKind(sym.kind),
            lineSpan: { start: sym.startLine, end: sym.endLine },
            snippet: snippet || `${sym.kind} ${sym.name}`,
            score: matchScore,
            matchReason,
          });
        }
      }

      // If no symbol matched, check file path or text content
      if (query && (file.path.toLowerCase().includes(query) || fileContent.toLowerCase().includes(query))) {
        // Find line where query appears
        let matchingLine = 1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(query)) {
            matchingLine = i + 1;
            break;
          }
        }

        const start = Math.max(0, matchingLine - 2);
        const end = Math.min(lines.length, matchingLine + 2);
        const snippet = lines.slice(start, end).join('\n');

        results.push({
          fileId: file.path,
          filePath: file.path,
          lineSpan: { start: matchingLine, end: matchingLine },
          snippet,
          score: file.path.toLowerCase().includes(query) ? 0.75 : 0.6,
          matchReason: file.path.toLowerCase().includes(query)
            ? `File path matches "${query}"`
            : `Text occurrence at line ${matchingLine}`,
        });
      }
    }

    // Sort by relevance score descending
    results.sort((a, b) => b.score - a.score);

    const response: SearchResponse = {
      results: results.slice(0, 50),
      totalMatches: results.length,
      executionTimeMs: Date.now() - startTime,
      modeUsed: mode,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Search failed:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});
