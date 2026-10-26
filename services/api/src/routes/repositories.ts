import { Router, Request, Response } from 'express';
import type { Repository, RepositoryRevision } from '@repograph/shared-types';
import { resolveRepository } from '../services/workspaceResolver.js';
import { scanRepository } from '../services/repositoryScanner.js';
import { analyzeRepository } from '../services/repositoryAnalyzer.js';
import { buildDependencyGraph } from '../services/dependencyGraph.js';
import { analyzeChangeImpact } from '../services/impactAnalyzer.js';

import { isPathInside } from '../services/workspaceResolver.js';
import { readFile, stat, realpath } from 'node:fs/promises';
import path from 'node:path';

export const repositoriesRouter = Router();

// Storage for dynamically registered repositories
const registeredRepositories: Map<string, Repository> = new Map([
  [
    'repo-sample-01',
    {
      id: 'repo-sample-01',
      name: 'RepoGraph',
      provider: 'local',
      remoteUrl: '',
      defaultBranch: 'main',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
]);

const registeredRevisions: Map<string, RepositoryRevision[]> = new Map();

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

// GET /api/repositories (Lists all available local & registered repositories)
repositoriesRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const list: Repository[] = Array.from(registeredRepositories.values());

    // Also check if RepoGraph itself is available in workspace
    const defaultResolution = await resolveRepository('RepoGraph');
    if (!('error' in defaultResolution)) {
      if (!list.some((r) => r.name === defaultResolution.repository)) {
        list.unshift({
          id: 'repo-repograph',
          name: defaultResolution.repository,
          provider: 'local',
          defaultBranch: 'main',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    res.status(200).json({
      repositories: list,
      total: list.length,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list repositories' });
  }
});

// POST /api/repositories
repositoriesRouter.post('/', (req: Request, res: Response) => {
  const { name, remoteUrl, provider = 'github', defaultBranch = 'main' } = req.body;

  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: 'Repository name is required' });
    return;
  }

  const id = `repo-${Date.now()}`;
  const newRepo: Repository = {
    id,
    name,
    remoteUrl,
    provider,
    defaultBranch,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  registeredRepositories.set(id, newRepo);
  registeredRevisions.set(id, [
    {
      id: `rev-${Date.now()}`,
      repositoryId: id,
      commitSha: 'HEAD',
      branch: defaultBranch,
      status: 'ready',
      progressPercent: 100,
      totalFiles: 0,
      totalSymbols: 0,
      totalEdges: 0,
    },
  ]);

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
repositoriesRouter.get('/:id', async (req: Request, res: Response) => {
  const repoId = req.params.id as string;
  let repo = registeredRepositories.get(repoId);

  // If not in registered map, try to resolve as a directory name
  if (!repo) {
    const resolved = await resolveRepository(repoId);
    if (!('error' in resolved)) {
      repo = {
        id: repoId,
        name: resolved.repository,
        provider: 'local',
        defaultBranch: 'main',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  }

  if (!repo) {
    res.status(404).json({ error: 'Repository not found' });
    return;
  }

  // Retrieve or compute real revision metrics
  let revisions = registeredRevisions.get(repo.id);
  if (!revisions) {
    try {
      const resolved = await resolveRepository(repo.name);
      if (!('error' in resolved)) {
        const files = await scanRepository(resolved.rootDirectory);
        revisions = [
          {
            id: `rev-${Date.now()}`,
            repositoryId: repo.id,
            commitSha: 'HEAD',
            branch: repo.defaultBranch,
            status: 'ready',
            progressPercent: 100,
            indexedAt: new Date().toISOString(),
            totalFiles: files.length,
            totalSymbols: 0,
            totalEdges: 0,
          },
        ];
        registeredRevisions.set(repo.id, revisions);
      }
    } catch {
      revisions = [];
    }
  }

  res.status(200).json({
    repository: repo,
    revisions: revisions || [],
  });
});

// POST /api/repositories/:id/index
repositoriesRouter.post('/:id/index', async (req: Request, res: Response) => {
  const repoId = req.params.id as string;
  const repo = registeredRepositories.get(repoId);

  if (!repo && repoId !== 'repo-sample-01') {
    res.status(404).json({ error: 'Repository not found' });
    return;
  }

  const newRevision: RepositoryRevision = {
    id: `rev-${Date.now()}`,
    repositoryId: repoId,
    commitSha: req.body.commitSha || 'latest',
    branch: req.body.branch || 'main',
    status: 'ready',
    progressPercent: 100,
    totalFiles: 0,
    totalSymbols: 0,
    totalEdges: 0,
  };

  const existing = registeredRevisions.get(repoId) || [];
  registeredRevisions.set(repoId, [newRevision, ...existing]);

  res.status(202).json({
    message: 'Indexing completed successfully',
    jobId: `job-${Date.now()}`,
    revision: newRevision,
  });
});

// GET /api/repositories/:id/file?path=... (Safe Source File Viewer)
repositoriesRouter.get('/:id/file', async (req: Request, res: Response) => {
  try {
    const repoId = req.params.id as string;
    const requestedPath = req.query.path;

    if (!requestedPath || typeof requestedPath !== 'string' || requestedPath.trim().length === 0) {
      res.status(400).json({ error: 'Query parameter "path" is required.' });
      return;
    }

    if (requestedPath.includes('\0')) {
      res.status(400).json({ error: 'Invalid file path.' });
      return;
    }

    const resolved = await resolveRepository(repoId);
    if ('error' in resolved) {
      res.status(resolved.status).json({ error: resolved.error });
      return;
    }

    const cleanPath = requestedPath.trim();
    const candidatePath = path.resolve(resolved.rootDirectory, cleanPath);

    if (!isPathInside(resolved.rootDirectory, candidatePath)) {
      res.status(403).json({ error: 'Access denied: path escapes repository boundary.' });
      return;
    }

    let fileStats;
    let realCandidatePath: string;
    try {
      realCandidatePath = await realpath(candidatePath);
      fileStats = await stat(realCandidatePath);
    } catch {
      res.status(404).json({ error: `File "${cleanPath}" was not found.` });
      return;
    }

    if (!isPathInside(resolved.rootDirectory, realCandidatePath)) {
      res.status(403).json({ error: 'Access denied: path escapes repository boundary via symlink.' });
      return;
    }

    if (!fileStats.isFile()) {
      res.status(400).json({ error: 'Requested path is not a file.' });
      return;
    }

    if (fileStats.size > 5 * 1024 * 1024) {
      res.status(413).json({ error: 'File is too large to preview (>5MB).' });
      return;
    }

    const content = await readFile(realCandidatePath, 'utf8');
    const lines = content.split(/\r?\n/).length;

    res.status(200).json({
      repository: resolved.repository,
      path: cleanPath.replace(/\\/g, '/'),
      content,
      lines,
      sizeBytes: fileStats.size,
      extension: path.extname(candidatePath).toLowerCase(),
    });
  } catch (error) {
    handleRepositoryError(error, res, 'File read');
  }
});
