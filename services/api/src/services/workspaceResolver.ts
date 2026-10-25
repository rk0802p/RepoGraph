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

export function findMonorepoRoot(startDir: string): string {
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
 * Checks if candidate path is strictly inside or equal to the parent root directory.
 */
export function isPathInside(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Resolves a repository name, relative path, or identifier to a validated directory.
 * Strict workspace containment ensures paths cannot escape the allowed workspace boundaries.
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

  // Reject null bytes
  if (repositoryPath.includes('\0')) {
    return {
      error: 'Invalid repository path.',
      status: 400,
    };
  }

  try {
    const rawPath = repositoryPath.trim();
    const monorepoRoot = findMonorepoRoot(process.cwd());
    const monorepoBase = path.basename(monorepoRoot).toLowerCase();

    // Canonical allowed workspace roots (strictly monorepoRoot and explicit REPOSITORY_WORKSPACE)
    const allowedRoots: string[] = [];
    try {
      allowedRoots.push(await realpath(monorepoRoot));
    } catch {
      allowedRoots.push(path.resolve(monorepoRoot));
    }

    if (process.env.REPOSITORY_WORKSPACE) {
      try {
        allowedRoots.push(await realpath(config.repositoryWorkspace));
      } catch {
        allowedRoots.push(path.resolve(config.repositoryWorkspace));
      }
    }

    // Portable aliases for current repository checkout (regardless of checkout folder name)
    const isCurrentRepoAlias =
      rawPath === '.' ||
      rawPath === '' ||
      rawPath === 'repo-sample-01' ||
      rawPath === 'repo-repograph' ||
      rawPath.toLowerCase() === 'repograph' ||
      rawPath.toLowerCase() === 'repograph-main' ||
      rawPath.toLowerCase() === 'repograph-master' ||
      rawPath.toLowerCase() === monorepoBase;

    if (isCurrentRepoAlias) {
      return {
        rootDirectory: allowedRoots[0],
        repository: path.basename(allowedRoots[0]),
      };
    }

    // Only search within explicitly allowed roots
    const candidates = [
      path.resolve(allowedRoots[0], rawPath),
      ...(process.env.REPOSITORY_WORKSPACE ? [path.resolve(config.repositoryWorkspace, rawPath)] : []),
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

    // Strict containment verification: targetDir MUST be contained inside one of allowedRoots
    const isContained = allowedRoots.some((allowed) => isPathInside(allowed, targetDir!));
    if (!isContained) {
      return {
        error: 'Access denied: repository directory is outside the allowed workspace boundary.',
        status: 403,
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
