import { Router, Request, Response } from 'express';
import path from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import type { Repository, RepositoryRevision } from '@repograph/shared-types';
import { scanRepository } from '../services/repositoryScanner.js';
import { analyzeRepository } from '../services/repositoryAnalyzer.js';
import { buildDependencyGraph } from '../services/dependencyGraph.js';
import { analyzeChangeImpact } from '../services/impactAnalyzer.js';
import { config } from '../config/index.js';

export const repositoriesRouter = Router();

// ==========================================
// Workspace & Repository Path Resolution
// ==========================================

type RepositoryResolution =
  | {
      error: string;
      status: number;
    }
  | {
      rootDirectory: string;
      repository: string;
    };

async function resolveRepository(
  repositoryPath: unknown
): Promise<RepositoryResolution> {
  if (
    typeof repositoryPath !== 'string' ||
    repositoryPath.trim().length === 0
  ) {
    return {
      error: 'A repository path is required in the "path" field.',
      status: 400,
    };
  }

  try {
    const rawPath = repositoryPath.trim();
    const candidates = [
      path.resolve(config.repositoryWorkspace, rawPath),
      path.resolve(process.cwd(), '..', rawPath),
      path.resolve(process.cwd(), rawPath),
    ];

    let targetDir: string | null = null;
    let repoName = rawPath;

    for (const cand of candidates) {
      try {
        const resolved = await realpath(cand);
        const stats = await stat(resolved);
        if (stats.isDirectory()) {
          targetDir = resolved;
          repoName = path.basename(resolved);
          break;
        }
      } catch {
        // Continue searching next candidate
      }
    }

    if (!targetDir) {
      return {
        error: 'Repository path not found.',
        status: 404,
      };
    }

    return {
      rootDirectory: targetDir,
      repository: repoName,
    };
  } catch (err: unknown) {
    return {
      error: 'Failed to resolve repository path.',
      status: 500,
    };
  }
}

function handleRepositoryError(
  error: unknown,
  res: Response,
  operation: string
): void {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  ) {
    res.status(404).json({
      error: 'Repository path not found.',
    });
    return;
  }

  console.error(`${operation} failed:`, error);

  res.status(500).json({
    error: `${operation} failed.`,
  });
}

// ==========================================
// In-Memory Repository Management
// ==========================================

const mockRepositories: Repository[] = [
  {
    id: 'repo-sample-01',
    name: 'repograph-core',
    provider: 'github',
    remoteUrl: 'https://github.com/repograph/repograph-core',
    defaultBranch: 'main',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const mockRevisions: Record<string, RepositoryRevision[]> = {
  'repo-sample-01': [
    {
      id: 'rev-sample-01',
      repositoryId: 'repo-sample-01',
      commitSha: 'a4b89f2',
      branch: 'main',
      status: 'ready',
      progressPercent: 100,
      indexedAt: new Date().toISOString(),
      totalFiles: 42,
      totalSymbols: 218,
      totalEdges: 395,
    },
  ],
};

// GET /api/repositories
repositoriesRouter.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    repositories: mockRepositories,
    total: mockRepositories.length,
  });
});

// POST /api/repositories
repositoriesRouter.post('/', (req: Request, res: Response) => {
  const { name, remoteUrl, provider = 'github', defaultBranch = 'main' } = req.body;

  if (!name) {
    res.status(400).json({ error: 'Repository name is required' });
    return;
  }

  const newRepo: Repository = {
    id: `repo-${Date.now()}`,
    name,
    remoteUrl,
    provider,
    defaultBranch,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  mockRepositories.unshift(newRepo);
  mockRevisions[newRepo.id] = [
    {
      id: `rev-${Date.now()}`,
      repositoryId: newRepo.id,
      commitSha: 'HEAD',
      branch: defaultBranch,
      status: 'queued',
      progressPercent: 0,
      totalFiles: 0,
      totalSymbols: 0,
      totalEdges: 0,
    },
  ];

  res.status(201).json(newRepo);
});

// POST /api/repositories/scan (Disk Scanner)
repositoriesRouter.post('/scan', async (req: Request, res: Response) => {
  try {
    const resolved = await resolveRepository(req.body?.path);

    if ('error' in resolved) {
      res.status(resolved.status).json({
        error: resolved.error,
      });
      return;
    }

    const files = await scanRepository(resolved.rootDirectory);

    res.status(200).json({
      repository: resolved.repository,
      totalFiles: files.length,
      files,
    });
  } catch (error) {
    handleRepositoryError(error, res, 'Repository scan');
  }
});

// POST /api/repositories/analyze (AST + Dependency Graph Generator)
repositoriesRouter.post('/analyze', async (req: Request, res: Response) => {
  try {
    const resolved = await resolveRepository(req.body?.path);

    if ('error' in resolved) {
      res.status(resolved.status).json({
        error: resolved.error,
      });
      return;
    }

    const analysis = await analyzeRepository(
      resolved.rootDirectory,
      resolved.repository
    );

    const graph = buildDependencyGraph(analysis.files);

    res.status(200).json({
      ...analysis,
      graph,
    });
  } catch (error) {
    handleRepositoryError(error, res, 'Repository analysis');
  }
});

// POST /api/repositories/impact (Change-Impact Graph Traversal)
repositoriesRouter.post('/impact', async (req: Request, res: Response) => {
  try {
    const { path: repositoryPath, file: changedFile } = req.body ?? {};

    if (
      typeof changedFile !== 'string' ||
      changedFile.trim().length === 0
    ) {
      res.status(400).json({
        error: 'A file path is required in the "file" field.',
      });
      return;
    }

    const resolved = await resolveRepository(repositoryPath);

    if ('error' in resolved) {
      res.status(resolved.status).json({
        error: resolved.error,
      });
      return;
    }

    const analysis = await analyzeRepository(
      resolved.rootDirectory,
      resolved.repository
    );

    const graph = buildDependencyGraph(analysis.files);

    const result = analyzeChangeImpact(graph, changedFile);

    if (!result.success) {
      res.status(404).json({
        error: result.error,
      });
      return;
    }

    res.status(200).json({
      repository: analysis.repository,
      ...result.report,
    });
  } catch (error) {
    handleRepositoryError(error, res, 'Change-impact analysis');
  }
});

// GET /api/repositories/:id
repositoriesRouter.get('/:id', (req: Request, res: Response) => {
  const repo = mockRepositories.find((r) => r.id === req.params.id);
  if (!repo) {
    res.status(404).json({ error: 'Repository not found' });
    return;
  }

  const revisions = mockRevisions[repo.id] || [];
  res.status(200).json({
    repository: repo,
    revisions,
  });
});

// POST /api/repositories/:id/index
repositoriesRouter.post('/:id/index', (req: Request, res: Response) => {
  const repo = mockRepositories.find((r) => r.id === req.params.id);
  if (!repo) {
    res.status(404).json({ error: 'Repository not found' });
    return;
  }

  const newRevision: RepositoryRevision = {
    id: `rev-${Date.now()}`,
    repositoryId: repo.id,
    commitSha: req.body.commitSha || 'latest',
    branch: req.body.branch || repo.defaultBranch,
    status: 'cloning',
    progressPercent: 15,
    totalFiles: 0,
    totalSymbols: 0,
    totalEdges: 0,
  };

  mockRevisions[repo.id] = [newRevision, ...(mockRevisions[repo.id] || [])];

  res.status(202).json({
    message: 'Indexing queued successfully',
    jobId: `job-${Date.now()}`,
    revision: newRevision,
  });
});
