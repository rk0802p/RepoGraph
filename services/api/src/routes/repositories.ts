import { Router, Request, Response } from 'express';
import type { Repository, RepositoryRevision } from '@repograph/shared-types';

export const repositoriesRouter = Router();

// In-memory demo store for immediate development before DB connection
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
