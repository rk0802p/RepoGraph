import { Router, Request, Response } from 'express';
import type { SearchResponse, SearchResultItem, SearchMode } from '@repograph/shared-types';

export const searchRouter = Router();

// GET /api/repositories/:id/search?q=...&mode=...
searchRouter.get('/:id/search', (req: Request, res: Response) => {
  const query = (req.query.q as string) || '';
  const mode = (req.query.mode as SearchMode) || 'hybrid';

  const mockResults: SearchResultItem[] = [
    {
      symbolId: 'sym-validate-token',
      fileId: 'file-auth-service',
      filePath: 'src/services/AuthService.ts',
      symbolName: 'validateToken',
      symbolKind: 'method',
      lineSpan: { start: 28, end: 45 },
      snippet: 'public async validateToken(token: string): Promise<UserSession> {\n  const decoded = jwt.verify(token, this.secret);\n  return this.loadSession(decoded.sub);\n}',
      score: 0.94,
      matchReason: 'Method name and signature match "token validate"',
    },
    {
      symbolId: 'sym-auth-middleware',
      fileId: 'file-auth-middleware',
      filePath: 'src/middleware/auth.ts',
      symbolName: 'requireAuth',
      symbolKind: 'function',
      lineSpan: { start: 10, end: 26 },
      snippet: 'export function requireAuth(req: Request, res: Response, next: NextFunction) {\n  const token = req.headers.authorization?.split(" ")[1];\n  if (!token) throw new UnauthorizedError();\n}',
      score: 0.88,
      matchReason: 'Calls validateToken downstream',
    },
  ];

  const filtered = query
    ? mockResults.filter(
        (r) =>
          r.symbolName?.toLowerCase().includes(query.toLowerCase()) ||
          r.filePath.toLowerCase().includes(query.toLowerCase()) ||
          r.snippet.toLowerCase().includes(query.toLowerCase())
      )
    : mockResults;

  const response: SearchResponse = {
    results: filtered,
    totalMatches: filtered.length,
    executionTimeMs: 12,
    modeUsed: mode,
  };

  res.status(200).json(response);
});
