import { Router, Request, Response } from 'express';
import type {
  ImpactAnalysisReport,
  AssistantQueryResponse,
  ImpactFinding,
  CodeSymbol,
} from '@repograph/shared-types';

export const analysisRouter = Router();

// POST /api/repositories/:id/ask
analysisRouter.post('/:id/ask', (req: Request, res: Response) => {
  const { question } = req.body;

  if (!question) {
    res.status(400).json({ error: 'Question is required' });
    return;
  }

  const response: AssistantQueryResponse = {
    answer:
      'Authentication is enforced at the HTTP gateway via `requireAuth` in `src/middleware/auth.ts`, which delegates token verification to `AuthService.validateToken` (`src/services/AuthService.ts`). If the JWT is expired or invalid, it halts the request with an HTTP 401 before any downstream controllers are reached.',
    citations: [
      {
        filePath: 'src/middleware/auth.ts',
        startLine: 10,
        endLine: 26,
        symbolName: 'requireAuth',
        snippet: 'const token = req.headers.authorization?.split(" ")[1];',
      },
      {
        filePath: 'src/services/AuthService.ts',
        startLine: 28,
        endLine: 45,
        symbolName: 'validateToken',
        snippet: 'public async validateToken(token: string): Promise<UserSession>',
      },
    ],
    confidence: 'observed',
    caveats: [
      'Static analysis resolved calls using TypeScript AST. Dynamic route middleware hooks are assumed to run sequentially.',
    ],
  };

  res.status(200).json(response);
});

// POST /api/repositories/:id/impact-analysis
analysisRouter.post('/:id/impact-analysis', (req: Request, res: Response) => {
  const { diffText } = req.body;

  const changedSymbols: CodeSymbol[] = [
    {
      id: 'sym-validate-token',
      fileId: 'file-auth-service',
      revisionId: 'rev-sample-01',
      name: 'validateToken',
      qualifiedName: 'src/services/AuthService.ts::AuthService.validateToken',
      kind: 'method',
      span: { startLine: 28, startColumn: 2, endLine: 45, endColumn: 3 },
      signature: 'public validateToken(token: string, options?: VerifyOptions): Promise<UserSession>',
      isExported: true,
    },
  ];

  const findings: ImpactFinding[] = [
    {
      id: 'find-1',
      targetSymbolId: 'sym-auth-middleware',
      targetSymbolName: 'requireAuth',
      targetFilePath: 'src/middleware/auth.ts',
      priority: 'high',
      confidenceLabel: 'observed',
      dependencyPath: ['validateToken', 'requireAuth'],
      rationale:
        'Direct caller: signature change or return type update directly alters the session structure passed down to request context.',
      suggestedTests: [
        {
          symbolId: 'sym-auth-test',
          name: 'tests/auth.test.ts',
          filePath: 'tests/auth.test.ts',
          isConfirmed: true,
        },
      ],
    },
    {
      id: 'find-2',
      targetSymbolId: 'sym-user-controller',
      targetSymbolName: 'getUserProfile',
      targetFilePath: 'src/controllers/user.ts',
      priority: 'medium',
      confidenceLabel: 'likely',
      dependencyPath: ['validateToken', 'requireAuth', 'getUserProfile'],
      rationale:
        'Indirect consumer: expects req.user from requireAuth; field alterations may cause runtime undefined access.',
      suggestedTests: [
        {
          symbolId: 'sym-user-test',
          name: 'tests/user.test.ts',
          filePath: 'tests/user.test.ts',
          isConfirmed: false,
        },
      ],
    },
  ];

  const report: ImpactAnalysisReport = {
    id: `analysis-${Date.now()}`,
    repositoryId: req.params.id as string,
    baseRevisionSha: 'a4b89f2',
    targetRevisionSha: 'HEAD',
    createdAt: new Date().toISOString(),
    summary: {
      totalChangedFiles: 1,
      totalChangedSymbols: changedSymbols.length,
      highImpactCount: 1,
      mediumImpactCount: 1,
      needsInspectionCount: 0,
    },
    changedSymbols,
    findings,
    limitations: [
      'Diff lines mapped to 1 exported method.',
      'Graph traversal bounded to depth 3.',
    ],
  };

  res.status(200).json(report);
});
