import { Router, Request, Response } from 'express';
import type { GraphNeighborhood, CodeSymbol, GraphEdge } from '@repograph/shared-types';

export const graphRouter = Router();

const sampleNodes: CodeSymbol[] = [
  {
    id: 'sym-auth-service',
    fileId: 'file-auth-service',
    revisionId: 'rev-sample-01',
    name: 'AuthService',
    qualifiedName: 'src/services/AuthService.ts::AuthService',
    kind: 'class',
    span: { startLine: 12, startColumn: 0, endLine: 85, endColumn: 1 },
    signature: 'class AuthService',
    docstring: 'Orchestrates JWT authentication and session tokens.',
    isExported: true,
  },
  {
    id: 'sym-validate-token',
    fileId: 'file-auth-service',
    revisionId: 'rev-sample-01',
    name: 'validateToken',
    qualifiedName: 'src/services/AuthService.ts::AuthService.validateToken',
    kind: 'method',
    span: { startLine: 28, startColumn: 2, endLine: 45, endColumn: 3 },
    signature: 'public validateToken(token: string): Promise<UserSession>',
    isExported: true,
    parentSymbolId: 'sym-auth-service',
  },
  {
    id: 'sym-auth-middleware',
    fileId: 'file-auth-middleware',
    revisionId: 'rev-sample-01',
    name: 'requireAuth',
    qualifiedName: 'src/middleware/auth.ts::requireAuth',
    kind: 'function',
    span: { startLine: 10, startColumn: 0, endLine: 26, endColumn: 1 },
    signature: 'function requireAuth(req: Request, res: Response, next: NextFunction): void',
    docstring: 'Express middleware verifying bearer token header.',
    isExported: true,
  },
  {
    id: 'sym-user-controller',
    fileId: 'file-user-controller',
    revisionId: 'rev-sample-01',
    name: 'getUserProfile',
    qualifiedName: 'src/controllers/user.ts::getUserProfile',
    kind: 'function',
    span: { startLine: 15, startColumn: 0, endLine: 35, endColumn: 1 },
    signature: 'async function getUserProfile(req: Request, res: Response): Promise<void>',
    isExported: true,
  },
  {
    id: 'sym-auth-test',
    fileId: 'file-auth-test',
    revisionId: 'rev-sample-01',
    name: 'test_token_expiry',
    qualifiedName: 'tests/auth.test.ts::test_token_expiry',
    kind: 'test_case',
    span: { startLine: 22, startColumn: 0, endLine: 34, endColumn: 1 },
    signature: 'it("rejects expired tokens with 401")',
    isExported: false,
  },
];

const sampleEdges: GraphEdge[] = [
  {
    id: 'edge-1',
    revisionId: 'rev-sample-01',
    sourceId: 'sym-auth-middleware',
    targetId: 'sym-validate-token',
    relationType: 'CALLS',
    resolutionMethod: 'ast_syntax',
    confidence: 'observed',
    sourceSpan: { startLine: 18, startColumn: 10, endLine: 18, endColumn: 45 },
  },
  {
    id: 'edge-2',
    revisionId: 'rev-sample-01',
    sourceId: 'sym-user-controller',
    targetId: 'sym-auth-middleware',
    relationType: 'CALLS',
    resolutionMethod: 'framework_convention',
    confidence: 'observed',
  },
  {
    id: 'edge-3',
    revisionId: 'rev-sample-01',
    sourceId: 'sym-auth-test',
    targetId: 'sym-validate-token',
    relationType: 'TESTS',
    resolutionMethod: 'import_table',
    confidence: 'observed',
  },
];

// GET /api/repositories/:id/graph
graphRouter.get('/:id/graph', (req: Request, res: Response) => {
  const symbolId = (req.query.symbolId as string) || 'sym-validate-token';
  const depth = Number(req.query.depth) || 2;

  const neighborhood: GraphNeighborhood = {
    rootSymbolId: symbolId,
    depth,
    nodes: sampleNodes,
    edges: sampleEdges,
    metadata: {
      truncated: false,
      totalConnected: sampleNodes.length,
    },
  };

  res.status(200).json(neighborhood);
});
