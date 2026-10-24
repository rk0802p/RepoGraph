import path from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { config } from '../config/index.js';

export type RepositoryResolution =
  | {
      error: string;
      status: number;
    }
  | {
      rootDirectory: string;
      repository: string;
    };

function findMonorepoRoot(startDir: string): string {
  let curr = path.resolve(startDir);
  while (true) {
    if (existsSync(path.join(curr, '.git')) || existsSync(path.join(curr, 'package.json'))) {
      if (existsSync(path.join(curr, 'services')) && existsSync(path.join(curr, 'apps'))) {
        return curr;
      }
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.resolve(startDir);
}

/**
 * Resolves a repository name, relative path, or identifier to a validated directory.
 */
export async function resolveRepository(
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
    const monorepoRoot = findMonorepoRoot(process.cwd());

    // If identifier matches monorepo or standard sample id, resolve immediately
    if (
      rawPath === 'repo-sample-01' ||
      rawPath === 'repo-repograph' ||
      rawPath.toLowerCase() === path.basename(monorepoRoot).toLowerCase() ||
      rawPath === '.' ||
      rawPath === ''
    ) {
      return {
        rootDirectory: monorepoRoot,
        repository: path.basename(monorepoRoot),
      };
    }

    // Try candidates
    const candidates = [
      path.resolve(config.repositoryWorkspace, rawPath),
      path.resolve(monorepoRoot, '..', rawPath),
      path.resolve(monorepoRoot, rawPath),
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
        // Continue searching
      }
    }

    if (!targetDir) {
      return {
        error: `Repository "${rawPath}" was not found in the configured workspace.`,
        status: 404,
      };
    }

    return {
      rootDirectory: targetDir,
      repository: repoName,
    };
  } catch {
    return {
      error: 'Failed to resolve repository path.',
      status: 500,
    };
  }
}
